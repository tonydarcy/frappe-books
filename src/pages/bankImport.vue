<template>
  <div class="flex flex-col overflow-hidden w-full h-full bg-white dark:bg-gray-900">
    <PageHeader title="Bank Statement Importer">
      <Button @click="showRulesModal = true" class="mr-2">
        Manage Bank Rules
      </Button>
    </PageHeader>

    <div class="flex-1 overflow-auto custom-scroll p-6 w-full max-w-5xl mx-auto pb-20">
      
      <!-- Status Bar -->
      <div v-if="statusMsg" 
           class="mb-6 p-4 rounded border shadow-sm"
           :class="isError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-blue-50 border-blue-200 text-blue-700'">
        <p class="font-medium flex items-center gap-2">
          <span v-if="isError">⚠️</span>
          <span v-else>ℹ️</span>
          {{ statusMsg }}
        </p>
      </div>

      <!-- CARD 1: Select File -->
      <div class="mb-6 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-6 shadow-sm">
        <h2 class="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">1. Upload Statement</h2>
        <div class="flex flex-col gap-4">
          <div class="flex items-center gap-4">
            <label class="cursor-pointer bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-4 py-2 rounded border dark:border-gray-600 transition-colors">
              <span>Choose File (QIF, OFX)</span>
              <input type="file" accept=".qif,.ofx" @change="handleFileSelect" class="hidden" />
            </label>
            <span v-if="fileName" class="font-semibold text-gray-700 dark:text-gray-300">{{ fileName }}</span>
            <span v-else class="text-gray-500 italic">No file selected</span>
          </div>
          
          <div v-if="parsedTransactions.length > 0" class="text-sm text-green-600 dark:text-green-400 font-medium bg-green-50 dark:bg-green-900/20 p-2 rounded w-fit">
             ✓ {{ parsedTransactions.length }} transactions. 
             <span v-if="matchedCount > 0" class="ml-2 font-bold">
               (Matched {{ matchedCount }} via rules)
             </span>
          </div>
        </div>
      </div>

      <!-- CARD 2: Map Accounts -->
      <div class="mb-6 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-6 shadow-sm">
        <h2 class="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">2. Default Accounts</h2>
        <p class="text-sm text-gray-500 mb-4">These accounts will be used if no Bank Rule matches a transaction.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          <div>
            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Bank Account (Asset)</label>
            <select v-model="selectedBankAccount" class="w-full border p-2 rounded bg-white dark:bg-gray-900 dark:border-gray-600 dark:text-gray-200">
              <option value="" disabled>Select Bank Account...</option>
              <option v-for="acc in accounts" :key="acc" :value="acc">{{ acc }}</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Suspense Account (Fallback)</label>
            <select v-model="selectedSuspenseAccount" class="w-full border p-2 rounded bg-white dark:bg-gray-900 dark:border-gray-600 dark:text-gray-200">
              <option value="" disabled>Select Suspense Account...</option>
              <option v-for="acc in accounts" :key="acc" :value="acc">{{ acc }}</option>
            </select>
          </div>
        </div>
      </div>

      <div class="flex justify-end pt-4">
        <Button 
          @click="runImport" 
          :disabled="!canImport"
          type="primary"
          class="px-8 py-3 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Import Data
        </Button>
      </div>
    </div>

    <!-- RULES MODAL -->
    <Modal :open-modal="showRulesModal" @closemodal="showRulesModal = false">
      <div class="w-[600px] bg-white dark:bg-gray-900 p-6 rounded-lg">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-xl font-bold">Bank Rules</h3>
          <button @click="showRulesModal = false" class="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        
        <div class="max-h-[400px] overflow-auto mb-4 border rounded">
          <table class="w-full text-sm text-left">
            <thead class="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold">
              <tr>
                <th class="p-2">If Description Contains</th>
                <th class="p-2">Allocate To</th>
                <th class="p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="rule in allocationRules" :key="rule.name" class="border-b dark:border-gray-700">
                <td class="p-2">{{ rule.description_contains }}</td>
                <td class="p-2 font-mono text-blue-600">{{ rule.target_account }}</td>
                <td class="p-2 text-center">
                  <button @click="deleteRule(rule.name)" class="text-red-500 hover:text-red-700 font-bold">×</button>
                </td>
              </tr>
              <tr v-if="allocationRules.length === 0">
                <td colspan="3" class="p-4 text-center text-gray-500">No rules defined yet.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="bg-gray-50 dark:bg-gray-800 p-4 rounded border dark:border-gray-700">
          <h4 class="font-semibold mb-2 text-sm">Add New Rule</h4>
          <div class="flex gap-2">
            <input 
              v-model="newRuleText" 
              placeholder="Text to match (e.g. 'Starbucks')"
              class="flex-1 border p-2 rounded text-sm dark:bg-gray-900 dark:border-gray-600"
            />
            <select v-model="newRuleAccount" class="flex-1 border p-2 rounded text-sm dark:bg-gray-900 dark:border-gray-600">
              <option value="" disabled>Select Account...</option>
              <option v-for="acc in accounts" :key="acc" :value="acc">{{ acc }}</option>
            </select>
            <Button @click="addRule" :disabled="!newRuleText || !newRuleAccount" type="primary">Add</Button>
          </div>
        </div>
      </div>
    </Modal>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import PageHeader from 'src/components/PageHeader.vue';
import Button from 'src/components/Button.vue';
import Modal from 'src/components/Modal.vue';
import { fyo } from 'src/initFyo';
import { DateTime } from 'luxon';

interface BankTransaction {
  date: string; 
  amount: number;
  description: string;
  matchedAccount?: string; // New field to store rule match
}

interface AllocationRule {
  name?: string;
  description_contains: string;
  target_account: string;
}

export default defineComponent({
  name: 'BankImport',
  components: { PageHeader, Button, Modal },
  data() {
    return {
      accounts: [] as string[],
      allocationRules: [] as AllocationRule[],
      fileName: '',
      parsedTransactions: [] as BankTransaction[],
      selectedBankAccount: '',
      selectedSuspenseAccount: 'Suspense Clearing',
      statusMsg: '',
      isError: false,
      isImporting: false,
      
      // Modal State
      showRulesModal: false,
      newRuleText: '',
      newRuleAccount: ''
    };
  },
  computed: {
    canImport(): boolean {
      return this.parsedTransactions.length > 0 && 
             !!this.selectedBankAccount && 
             !!this.selectedSuspenseAccount &&
             !this.isImporting;
    },
    matchedCount(): number {
      return this.parsedTransactions.filter(t => t.matchedAccount).length;
    }
  },
  mounted() {
    this.loadAccounts();
    this.loadRules();
  },
  methods: {
    async loadAccounts() {
      if (!fyo || !fyo.db) return;
      try {
        const result = await fyo.db.getAll('Account');
        this.accounts = result
          .filter((acc: any) => !acc.isGroup)
          .map((r: any) => r.name)
          .sort();
      } catch (e) {
        console.error(e);
        this.statusMsg = "Error loading accounts.";
      }
    },

    async loadRules() {
      if (!fyo || !fyo.db) return;
      try {
        // Fetch all rules from the new schema
        const result = await fyo.db.getAll('BankAllocationRule');
        this.allocationRules = result;
      } catch (e) {
        console.warn("Rules not loaded (Schema might not exist yet)", e);
      }
    },

    async addRule() {
      if (!this.newRuleText || !this.newRuleAccount) return;
      
      try {
        const newRule = fyo.doc.getNewDoc('BankAllocationRule', {
            description_contains: this.newRuleText,
            target_account: this.newRuleAccount
        }, false);
        
        await newRule.sync();
        
        // Refresh list and clear inputs
        await this.loadRules();
        this.newRuleText = '';
        this.newRuleAccount = '';
        
        // Re-apply rules to currently loaded transactions
        if (this.parsedTransactions.length > 0) {
            this.applyRules();
        }
      } catch (e: any) {
        alert("Failed to save rule: " + e.message);
      }
    },

    async deleteRule(name?: string) {
      if (!name) return;
      if (!confirm("Delete this rule?")) return;
      
      try {
        await fyo.db.delete('BankAllocationRule', name);
        await this.loadRules();
        if (this.parsedTransactions.length > 0) this.applyRules();
      } catch (e: any) {
        alert("Failed to delete: " + e.message);
      }
    },

    applyRules() {
      // Iterate through all transactions and check for rule matches
      this.parsedTransactions.forEach(tx => {
        tx.matchedAccount = undefined; // Reset
        const desc = tx.description.toLowerCase();
        
        // Simple containment check
        const match = this.allocationRules.find(rule => 
            desc.includes(rule.description_contains.toLowerCase())
        );
        
        if (match) {
            tx.matchedAccount = match.target_account;
        }
      });
    },

    parseDate(dateStr: string): string | null {
      if (!dateStr) return null;
      const clean = dateStr.trim().replace(/^D/, '');
      const formats = ['d/M/yyyy', 'd/M/yy', 'yyyy-MM-dd', 'M/d/yyyy', 'yyyyMMdd'];
      
      for (const fmt of formats) {
        const dt = DateTime.fromFormat(clean, fmt);
        if (dt.isValid) return dt.toISODate();
      }
      return null;
    },

    async handleFileSelect(event: Event) {
      const target = event.target as HTMLInputElement;
      if (!target.files || !target.files[0]) return;

      const file = target.files[0];
      this.fileName = file.name;
      this.statusMsg = "Parsing file...";
      this.parsedTransactions = [];

      try {
        const text = await file.text();
        const ext = file.name.split('.').pop()?.toLowerCase();

        if (ext === 'qif') this.parseQIF(text);
        else if (ext === 'ofx') this.parseOFX(text);
        else {
          this.statusMsg = "Unsupported file format.";
          this.isError = true;
        }

        if (this.parsedTransactions.length > 0) {
           // Apply rules immediately after parsing
           this.applyRules();
           
           this.statusMsg = `Ready to import ${this.parsedTransactions.length} transactions.`;
           this.isError = false;
        }
      } catch (e) {
        console.error(e);
        this.statusMsg = "Failed to read file.";
      }
    },

    parseQIF(content: string) {
      const rawTxns = content.split('^');
      for (const raw of rawTxns) {
        const lines = raw.trim().split('\n');
        if (lines.length < 2) continue;
        
        let date = null;
        let amount = 0;
        const desc = [];

        for (let line of lines) {
          line = line.trim();
          if (!line) continue;
          const char = line[0].toUpperCase();
          const data = line.substring(1).trim();

          if (char === 'D') date = this.parseDate(data);
          else if (char === 'T') amount = parseFloat(data.replace(/,/g, ''));
          else if (['P', 'M', 'L'].includes(char)) desc.push(data);
        }

        if (date) {
          this.parsedTransactions.push({ date, amount, description: desc.join(' - ') });
        }
      }
    },

    parseOFX(content: string) {
      const blockMatch = content.match(/<BANKTRANLIST>([\s\S]*?)<\/BANKTRANLIST>/i);
      if (!blockMatch) return;

      const txRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
      let match;
      while ((match = txRegex.exec(blockMatch[1])) !== null) {
        const inner = match[1];
        const dateM = inner.match(/<DTPOSTED>(\d{8})/i);
        const amtM = inner.match(/<TRNAMT>([-\d.]+)/i);
        const nameM = inner.match(/<NAME>(.*?)<\/NAME>/i);
        const memoM = inner.match(/<MEMO>(.*?)<\/MEMO>/i);

        if (dateM && amtM) {
           const desc = [];
           if (nameM) desc.push(nameM[1]);
           if (memoM) desc.push(memoM[1]);
           
           this.parsedTransactions.push({
             date: this.parseDate(dateM[1]) || '',
             amount: parseFloat(amtM[1]),
             description: desc.join(' - ')
           });
        }
      }
    },

    async runImport() {
      if (!confirm(`Import ${this.parsedTransactions.length} Journal Entries now?`)) return;
      
      this.isImporting = true;
      this.statusMsg = "Importing data...";
      let count = 0;

      try {
        const schemaName = 'JournalEntry';
        
        for (const tx of this.parsedTransactions) {
          if (!tx.amount || !tx.date) continue;

          let debitAcc = '';
          let creditAcc = '';
          let val = 0;
          
          // LOGIC: Use matched account if available, otherwise fallback to Suspense
          const targetAccount = tx.matchedAccount || this.selectedSuspenseAccount;

          if (tx.amount > 0) {
            // Deposit: Bank increases (Debit), Income/Source increases (Credit)
            debitAcc = this.selectedBankAccount;
            creditAcc = targetAccount;
            val = tx.amount;
          } else {
            // Withdrawal: Expense/Asset increases (Debit), Bank decreases (Credit)
            debitAcc = targetAccount;
            creditAcc = this.selectedBankAccount;
            val = Math.abs(tx.amount);
          }

          const jeData = {
            doctype: schemaName,
            date: tx.date,
            // FIX: Changed 'Journal Entry' to 'Bank Entry' for better classification
            entryType: 'Bank Entry', 
            voucherType: 'Journal Entry',
            // FIX: Mapped description to 'userRemark' as 'description' and 'title' do not exist in Schema
            userRemark: tx.description.substring(0, 140),
            accounts: [
              {
                doctype: 'JournalEntryAccount',
                parentfield: 'accounts',
                parenttype: schemaName,
                account: debitAcc,
                debit: val,
                credit: 0,
                // NOTE: 'description' field must be added to JournalEntryAccount.json (see below) 
                // otherwise this line will be ignored or cause an error.
                description: tx.description.substring(0, 140)
              },
              {
                doctype: 'JournalEntryAccount',
                parentfield: 'accounts',
                parenttype: schemaName,
                account: creditAcc,
                debit: 0,
                credit: val,
                description: tx.description.substring(0, 140)
              }
            ]
          };

          const doc = fyo.doc.getNewDoc(schemaName, jeData, false);
          await doc.sync();
          await doc.submit();

          count++;
        }
        
        this.statusMsg = `Success! Created ${count} Journal Entries.`;
        this.parsedTransactions = [];
        this.fileName = '';
        
      } catch (e: any) {
        console.error(e);
        this.isError = true;
        this.statusMsg = `Import Error: ${e.message || e}`;
      } finally {
        this.isImporting = false;
      }
    }
  }
});
</script>