import { Schema } from '../types';

// Import Swiss (CH) Schemas
import CHAccountingSettings from './ch/AccountingSettings.json';

// Import Indian (IN) Schemas
import INAccountingSettings from './in/AccountingSettings.json';
import INAddress from './in/Address.json';
import INParty from './in/Party.json';

const regionalSchemas: Record<string, Record<string, Schema>> = {
  ch: {
    AccountingSettings: CHAccountingSettings as Schema,
  },
  in: {
    AccountingSettings: INAccountingSettings as Schema,
    Address: INAddress as Schema,
    Party: INParty as Schema,
  },
};

export default regionalSchemas;

export function getRegionalSchemas(country?: string): Record<string, Schema> {
  if (!country) return {};
  return regionalSchemas[country.toLowerCase()] || {};
}