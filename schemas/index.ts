import { RawCustomField } from 'backend/database/types';
import { cloneDeep } from 'lodash';
import { getListFromMap, getMapFromList } from 'utils';
// Ensure core schemas load first
import { appSchemas, coreSchemas, metaSchemas } from './schemas';
import regionalSchemas from './regional/index';
import type {
  DynamicLinkField,
  Field,
  OptionField,
  Schema,
  SchemaMap,
  SelectOption,
  TargetField,
  DynamicLinkField as DynamicLinkFieldType,
} from './types';

const NAME_FIELD = {
  fieldname: 'name',
  label: `ID`,
  fieldtype: 'Data',
  required: true,
  readOnly: true,
};

export function getSchemas(
  countryCode = '-',
  rawCustomFields: RawCustomField[]
): Readonly<SchemaMap> {
  const builtCoreSchemas = getCoreSchemas();
  const builtAppSchemas = getAppSchemas(countryCode);

  let schemaMap = Object.assign({}, builtAppSchemas, builtCoreSchemas);
  schemaMap = addMetaFields(schemaMap);
  schemaMap = removeFields(schemaMap);
  schemaMap = setSchemaNameOnFields(schemaMap);

  addCustomFields(schemaMap, rawCustomFields);
  deepFreeze(schemaMap);
  return schemaMap;
}

export function setSchemaNameOnFields(schemaMap: SchemaMap): SchemaMap {
  for (const schemaName in schemaMap) {
    const schema = schemaMap[schemaName];
    if (!schema || !Array.isArray(schema.fields)) continue;

    for (const field of schema.fields) {
      field.schemaName = schemaName;
      field.schemaLabel = schema.label;
    }
  }
  return schemaMap;
}

function getCoreSchemas(): SchemaMap {
  const safeMetaSchemas = metaSchemas || {};
  const builtCoreSchemas = Object.assign(
    {},
    coreSchemas,
    safeMetaSchemas
  ) as unknown as SchemaMap;
  for (const schemaName in builtCoreSchemas) {
    builtCoreSchemas[schemaName].isCore = true;
  }
  return builtCoreSchemas;
}

function getAppSchemas(countryCode: string): SchemaMap {
  const safeRegionalSchemas = regionalSchemas || {};
  const regional = safeRegionalSchemas[countryCode] ?? {};
  return Object.assign({}, appSchemas, regional) as unknown as SchemaMap;
}

function addMetaFields(schemaMap: SchemaMap): SchemaMap {
  for (const schemaName in schemaMap) {
    const schema = schemaMap[schemaName];
    if (!schema) continue;

    // Initialize fields if missing
    if (!Array.isArray(schema.fields)) {
      schema.fields = [];
    }

    const metaFields = getMetaFields(schema, schemaMap);
    schema.fields = [...metaFields, ...schema.fields];
  }
  return schemaMap;
}

function getMetaFields(schema: Schema, schemaMap: SchemaMap): Field[] {
  const fields = [];

  // Only add NAME_FIELD if it doesn't already exist in schema.fields
  const hasNameField = schema.fields && schema.fields.some(f => f.fieldname === 'name');
  
  if (schema.naming !== 'random' && !hasNameField) {
    fields.push(cloneDeep(NAME_FIELD));
  }

  // --- DEFENSIVE CHECKS START HERE ---
  
  if (schema.isTree) {
    if (schemaMap.Tree && schemaMap.Tree.fields) {
      fields.push(...cloneDeep(schemaMap.Tree.fields));
    }
  }

  if (schema.isChild) {
    if (schemaMap.Child && schemaMap.Child.fields) {
      fields.push(...cloneDeep(schemaMap.Child.fields));
    }
  } else {
    // This is where your error was happening (schemaMap.Base was undefined)
    if (schemaMap.Base && schemaMap.Base.fields) {
      fields.push(...cloneDeep(schemaMap.Base.fields));
    }
  }

  if (schema.isSubmittable) {
    if (schemaMap.Submittable && schemaMap.Submittable.fields) {
      fields.push(...cloneDeep(schemaMap.Submittable.fields));
    }
  }
  
  // --- DEFENSIVE CHECKS END ---

  for (const field of fields) {
    field.meta = true;
  }

  return fields as Field[];
}

function removeFields(schemaMap: SchemaMap): SchemaMap {
  for (const schemaName in schemaMap) {
    const schema = schemaMap[schemaName];
    if (Array.isArray(schema.fields)) {
        schema.fields = schema.fields.filter((f) => !f.remove);
    }
  }
  return schemaMap;
}

function addCustomFields(
  schemaMap: SchemaMap,
  rawCustomFields: RawCustomField[]
): void {
  const customFieldMap = getCustomFieldMap(rawCustomFields);
  for (const schemaName in customFieldMap) {
    const schema = schemaMap[schemaName];
    if (!schema) continue;
    
    if (!Array.isArray(schema.fields)) schema.fields = [];
    schema.fields.push(...customFieldMap[schemaName]);
  }
}

function getCustomFieldMap(rawCustomFields: RawCustomField[]) {
  return rawCustomFields.reduce(
    (
      map: Record<string, Field[]>,
      {
        parent,
        fieldname,
        label,
        fieldtype,
        options: rawOptions,
        isRequired,
        default: defaultValue,
        target,
        references,
        section,
        tab,
      }
    ) => {
      const schemaFieldMap = getMapFromList(
        map[parent] ?? [],
        'fieldname'
      );

      if (schemaFieldMap[fieldname]) {
        return map;
      }

      map[parent] ??= [];
      const options = rawOptions
        ?.split('\n')
        .map((o) => {
          const value = o.trim();
          return { value, label: value } as SelectOption;
        })
        .filter((o) => o.label && o.value);

      const field = {
        label,
        fieldname,
        fieldtype,
        section,
        tab,
        isCustom: true,
      } as Field;

      if (options?.length) {
        (field as OptionField).options = options;
      }

      if (typeof isRequired === 'number' || typeof isRequired === 'boolean') {
        field.required = Boolean(isRequired);
      }

      if (typeof target === 'string') {
        (field as TargetField).target = target;
      }

      if (typeof references === 'string') {
        (field as DynamicLinkField).references = references;
      }

      if (field.required && defaultValue != null) {
        field.default = defaultValue;
      }

      map[parent].push(field);
      return map;
    },
    {} as Record<string, Field[]>
  );
}

function deepFreeze(obj: any) {
  if (process.env.NODE_ENV === 'production') return;
  Object.freeze(obj);
  for (const key in obj) {
    const prop = obj[key];
    if (typeof prop === 'object' && prop !== null && !Object.isFrozen(prop)) {
      deepFreeze(prop);
    }
  }
}