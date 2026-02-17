// OpenDART API tools - Issue #6
// Financial statements, disclosures, shareholding data from opendart.fss.or.kr

export { OpenDartClient, type OpenDartClientOptions } from './client.js';

export {
  getFinancialStatements,
  getCompanyInfo,
  getDisclosures,
  type FinancialStatementItem,
  type FinancialStatementResult,
  type CompanyInfoResult,
  type DisclosureItem,
  type DisclosureSearchResult,
  type DisclosureSearchOptions,
} from './tools.js';

export {
  normalizeAccountName,
  getAccountLabel,
  AccountMapper,
  accountMapper,
  ACCOUNT_MAPPINGS,
  type AccountCategory,
  type AccountMapping,
  type MappingCategory,
  type StatementType,
} from './account-mapper.js';
