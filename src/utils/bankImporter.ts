import { Fyo } from 'fyo';
import { BankRule } from 'models/baseModels/BankRule/BankRule';
import { BankRuleCondition } from 'models/baseModels/BankRule/BankRuleCondition';
import { ConditionOperator } from 'models/baseModels/BankRule/types';
import { ModelNameEnum } from 'models/types';
import { BankTransaction } from './bankStatementParsers';

function checkCondition(
  condition: BankRuleCondition,
  transaction: BankTransaction
): boolean {
  const { field, operator, value } = condition;
  if (!field || !operator || value === undefined || value === null) return false;

  let transactionValue =
    field === 'amount'
      ? transaction.amount.toString()
      : transaction.description;

  let conditionValue = value;

  if (field === 'description') {
    transactionValue = transactionValue.toLowerCase();
    conditionValue = conditionValue.toLowerCase();
  }

  switch (operator as ConditionOperator) {
    case 'contains':
      return transactionValue.includes(conditionValue);
    case 'not contains':
      return !transactionValue.includes(conditionValue);
    case 'equals':
      return transactionValue === conditionValue;
    case 'not equals':
      return transactionValue !== conditionValue;
    case 'starts with':
      return transactionValue.startsWith(conditionValue);
    case 'ends with':
      return transactionValue.endsWith(conditionValue);
    default:
      return false;
  }
}

function getAccountFromRules(
  rules: BankRule[],
  transaction: BankTransaction
): string | null {
  for (const rule of rules) {
    if (!rule.conditions || rule.conditions.length === 0) continue;

    const conditionsMet = rule.conditions.every((condition) =>
      checkCondition(condition, transaction)
    );

    if (conditionsMet && rule.targetAccount) {
      return rule.targetAccount;
    }
  }
  return null;
}

export async function importBankTransactions(
  fyo: Fyo,
  transactions: BankTransaction[],
  bankAccount: string,
  suspenseAccount: string
) {
  const schemaName = 'JournalEntry';
  let importCount = 0;
  let lastError: any = null;

  // Pre-check: Ensure we can create a doc
  try {
    const tempDoc = fyo.doc.getNewDoc(schemaName, {});
    if (!tempDoc) {
      console.warn(
        'Importer: Failed to initialize a temporary JournalEntry doc.'
      );
    }
  } catch (e) {
    console.warn('Importer: Pre-check failed', e);
  }

  const rules = (await fyo.db.getAll(ModelNameEnum.BankRule, {
    filters: { isEnabled: true },
    orderBy: 'priority',
    order: 'asc',
  })) as BankRule[];

  for (const tx of transactions) {
    if (tx.amount === 0) continue;
    if (!tx.date) continue;

    let debitAccount = '';
    let creditAccount = '';
    let finalAmount = 0;

    const otherAccount = getAccountFromRules(rules, tx) ?? suspenseAccount;

    // Double Entry Logic
    if (tx.amount > 0) {
      // Deposit: Bank Debited (Increase), Other Account Credited
      debitAccount = bankAccount;
      creditAccount = otherAccount;
      finalAmount = tx.amount;
    } else {
      // Withdrawal: Bank Credited (Decrease), Other Account Debited
      debitAccount = otherAccount;
      creditAccount = bankAccount;
      finalAmount = Math.abs(tx.amount);
    }

    // Create a single Journal Entry document
    const doc = fyo.doc.getNewDoc(schemaName, {
      date: tx.date,
      entryType: 'Bank Entry',
      userRemark: tx.description
        ? tx.description.substring(0, 280)
        : 'Bank Import',
      accounts: [
        {
          account: debitAccount,
          debit: finalAmount,
          credit: 0,
          description: tx.description,
        },
        {
          account: creditAccount,
          debit: 0,
          credit: finalAmount,
          description: tx.description,
        },
      ],
    });

    try {
      // Saves as Draft. To submit immediately, call await doc.submit() after sync.
      await doc.sync();
      importCount++;
    } catch (error) {
      console.error('Importer: Failed to save transaction', tx, error);
      lastError = error;
      // Stop at the first error to allow debugging
      break;
    }
  }

  if (importCount === 0 && transactions.length > 0 && lastError) {
    throw lastError;
  }

  return importCount;
}
