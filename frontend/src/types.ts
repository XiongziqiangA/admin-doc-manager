export type UserRole = "ADMIN" | "EMPLOYEE";
export type UserStatus = "ACTIVE" | "DISABLED";
export type DocumentStatus = "NORMAL" | "ARCHIVED" | "DELETED";
export type PartnerType = "CUSTOMER" | "SUPPLIER" | "PARTNER" | "OTHER";
export type PartnerStatus = "ACTIVE" | "DISABLED";
export type FinancePackageStatus = "DRAFT" | "READY" | "EXPORTED";
export type FinanceAnalysisJobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
export type FinanceSuggestionStatus = "PENDING" | "CONFIRMED" | "REJECTED";
export type FinanceAiConfigSource = "database" | "environment";
export type FinanceMaterialType =
  | "REIMBURSEMENT_FORM"
  | "INVOICE"
  | "PAYMENT_FORM"
  | "TICKET"
  | "CONTRACT"
  | "BANK_RECEIPT"
  | "OTHER";

export type BusinessMatterType = "PROJECT" | "CONTRACT" | "REIMBURSEMENT" | "LOAN" | "PROCUREMENT" | "OTHER";
export type BusinessMatterStatus = "PLANNING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type BusinessTaskStatus = "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type BusinessTaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type BusinessFollowUpMethod = "CALL" | "WECHAT" | "EMAIL" | "MEETING" | "ONSITE" | "OTHER";
export type BusinessFinanceKind = "LOAN" | "REIMBURSEMENT";
export type BusinessFinanceStatus = "DRAFT" | "PENDING" | "APPROVED" | "PAID" | "SETTLED" | "REJECTED" | "CANCELLED";
export type BusinessContractStatus = "DRAFT" | "ACTIVE" | "EXPIRED" | "TERMINATED";

export interface FinanceAiConfig {
  enabled: boolean;
  configured: boolean;
  apiKeyConfigured: boolean;
  baseUrl: string;
  model: string;
  promptVersion: string;
  source: FinanceAiConfigSource;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  lastTestStatus: string | null;
  lastTestModel: string | null;
  lastTestDurationMs: number | null;
  lastTestEndpoint: string | null;
}

export interface FinanceAiVerification {
  success: true;
  model: string;
  durationMs: number;
  endpoint: "models+chat/completions" | "chat/completions";
  modelListed: boolean;
  testedAt: string;
  message: string;
  config: FinanceAiConfig;
}
export type DocumentLogAction =
  | "UPLOAD"
  | "VIEW_DETAIL"
  | "DOWNLOAD"
  | "EDIT_INFO"
  | "UPLOAD_VERSION"
  | "DELETE"
  | "RESTORE";
export type DocumentLogResult = "SUCCESS" | "FAILURE";

export interface ApiEnvelope<T> {
  success: true;
  data: T;
  message: string;
  requestId: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ApiList<T> {
  items: T[];
  pagination: Pagination;
}

export interface PublicUser {
  id: string;
  username: string;
  realName: string;
  role: UserRole;
  status: UserStatus;
  departmentId: string | null;
  phone: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResult {
  accessToken: string;
  user: PublicUser;
}

export interface CategoryNode {
  id: string;
  name: string;
  code: string | null;
  parentId: string | null;
  level: number;
  isSystem: boolean;
  sort: number;
  children?: CategoryNode[];
}

export interface TagRecord {
  id: string;
  name: string;
  normalized: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerRecord {
  id: string;
  companyName: string;
  type: PartnerType;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  remark: string | null;
  status: PartnerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentRecord {
  id: string;
  name: string;
  parentId: string | null;
  managerNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserRecord extends PublicUser {}

export interface DocumentVersionRecord {
  id: string;
  documentId: string;
  versionNo: string;
  versionLabel: string;
  originalFileName: string;
  storageKey: string;
  fileSize: number;
  mimeType: string;
  fileExt: string;
  checksum: string;
  uploadUserId: string;
  changeNote: string | null;
  createdAt: string;
}

export interface DocumentLink<T> {
  [key: string]: T;
}

export interface DocumentRecord {
  id: string;
  title: string;
  documentNo: string;
  categoryId: string;
  subcategoryId: string | null;
  departmentId: string | null;
  status: DocumentStatus;
  creatorId: string;
  remark: string | null;
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  category?: CategoryNode;
  subcategory?: CategoryNode | null;
  department?: DepartmentRecord | null;
  creator?: PublicUser;
  currentVersion?: DocumentVersionRecord | null;
  documentTags?: Array<{ tag: TagRecord }>;
  documentPartners?: Array<{ partner: PartnerRecord }>;
}

export interface DocumentLogRecord {
  id: string;
  documentId: string;
  versionId: string | null;
  userId: string;
  action: DocumentLogAction;
  ip: string | null;
  userAgent: string | null;
  result: DocumentLogResult;
  createdAt: string;
  document?: { id: string; title: string; documentNo: string };
  version?: { id: string; versionNo: string; versionLabel: string } | null;
  user?: { id: string; username: string; realName: string };
}

export interface DocumentListQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  categoryId?: string;
  subcategoryId?: string;
  tagId?: string;
  partnerId?: string;
  uploaderId?: string;
  uploadedFrom?: string;
  uploadedTo?: string;
  status?: DocumentStatus;
  sortBy?: "createdAt" | "updatedAt" | "title" | "documentNo";
  sortOrder?: "asc" | "desc";
}

export interface BusinessMatterPerson {
  id: string;
  username: string;
  realName: string;
}

export interface BusinessMatterSummary {
  id: string;
  matterNo: string;
  title: string;
  type: BusinessMatterType;
  status: BusinessMatterStatus;
  parentId?: string | null;
  updatedAt?: string;
}

export interface BusinessMatterRecord extends BusinessMatterSummary {
  ownerId: string;
  ownerName: string | null;
  createdById: string;
  departmentId: string | null;
  departmentName: string | null;
  partnerId: string | null;
  partnerName: string | null;
  startDate: string | null;
  endDate: string | null;
  amount: string | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  parent?: BusinessMatterSummary | null;
  owner?: BusinessMatterPerson;
  createdBy?: BusinessMatterPerson;
  department?: { id: string; name: string } | null;
  partner?: { id: string; companyName: string } | null;
  _count?: { documents: number; children: number };
}

export interface BusinessMatterChild extends BusinessMatterSummary {
  parentId: string | null;
}

export interface BusinessMatterDocumentLink {
  matterId: string;
  documentId: string;
  versionId: string | null;
  relationType: string;
  isPrimary: boolean;
  createdAt: string;
  document: DocumentRecord;
  version?: DocumentVersionRecord | null;
}

export interface BusinessWorkflowDocumentLink {
  taskId?: string;
  followUpId?: string;
  documentId: string;
  versionId: string | null;
  relationType: string;
  createdAt: string;
  document: DocumentRecord;
  version?: DocumentVersionRecord | null;
}

export interface BusinessMatterDetail extends BusinessMatterRecord {
  children: BusinessMatterChild[];
  documents: BusinessMatterDocumentLink[];
}

export interface BusinessTaskRecord {
  id: string;
  matterId: string;
  title: string;
  description: string | null;
  status: BusinessTaskStatus;
  priority: BusinessTaskPriority;
  progress: number;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  completedById: string | null;
  completionNote: string | null;
  cancelledAt: string | null;
  cancelledById: string | null;
  cancellationReason: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  assignee?: BusinessMatterPerson | null;
  createdBy?: BusinessMatterPerson;
  completedBy?: BusinessMatterPerson | null;
  cancelledBy?: BusinessMatterPerson | null;
  documents: BusinessWorkflowDocumentLink[];
}

export interface BusinessFollowUpRecord {
  id: string;
  matterId: string;
  method: BusinessFollowUpMethod;
  content: string;
  result: string | null;
  nextAction: string | null;
  nextAssigneeId: string | null;
  nextAssigneeName: string | null;
  nextDueAt: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: BusinessMatterPerson;
  nextAssignee?: BusinessMatterPerson | null;
  documents: BusinessWorkflowDocumentLink[];
}

export interface BusinessContractRecord {
  id: string;
  matterId: string;
  contractNo: string | null;
  partyName: string;
  signedAt: string | null;
  effectiveAt: string | null;
  expiresAt: string | null;
  renewalNoticeDays: number;
  amount: string | null;
  status: BusinessContractStatus;
  remark: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: BusinessMatterPerson;
}

export interface BusinessFinanceDocumentLink {
  recordId: string;
  documentId: string;
  versionId: string | null;
  relationType: string;
  createdAt: string;
  document: DocumentRecord;
  version?: DocumentVersionRecord | null;
}

export interface BusinessFinanceRecord {
  id: string;
  matterId: string;
  recordNo: string;
  kind: BusinessFinanceKind;
  status: BusinessFinanceStatus;
  title: string;
  amount: string;
  currency: string;
  applicantId: string | null;
  applicantName: string | null;
  handlerId: string | null;
  handlerName: string | null;
  approverId: string | null;
  approverName: string | null;
  payerId: string | null;
  payerName: string | null;
  settlementOwnerId: string | null;
  settlementOwnerName: string | null;
  occurredAt: string | null;
  counterparty: string | null;
  dueDate: string | null;
  settledAt: string | null;
  approvedAt: string | null;
  approvedById: string | null;
  paidAt: string | null;
  paidById: string | null;
  rejectedAt: string | null;
  rejectedById: string | null;
  rejectionReason: string | null;
  settlementNote: string | null;
  remark: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  documents: BusinessFinanceDocumentLink[];
  createdBy?: BusinessMatterPerson;
  applicant?: BusinessMatterPerson | null;
  handler?: BusinessMatterPerson | null;
  approver?: BusinessMatterPerson | null;
  payer?: BusinessMatterPerson | null;
  settlementOwner?: BusinessMatterPerson | null;
  approvedBy?: BusinessMatterPerson | null;
  paidBy?: BusinessMatterPerson | null;
  rejectedBy?: BusinessMatterPerson | null;
}

export interface BusinessActivityRecord {
  id: string;
  matterId: string;
  actorId: string;
  action: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: BusinessMatterPerson;
}

export interface BusinessWorkflowOverview {
  matters: { total: number; inProgress: number };
  tasks: { pending: number; overdue: number; dueSoon: number };
  followUps: { pending: number; overdue: number; dueSoon: number };
  contracts: { dueSoon: number };
  finance: {
    loanCount: number;
    loanAmount: string;
    reimbursementCount: number;
    reimbursementAmount: string;
  };
}

export interface BusinessResponsibilityReportItem {
  userId: string;
  username: string;
  realName: string;
  tasks: { pending: number; completed: number; overdue: number };
  finance: { loansHandled: number; reimbursementsHandled: number; approved: number; paid: number; settled: number };
  followUps: { created: number; overdue: number };
}

export interface BusinessResponsibilityReport {
  generatedAt: string;
  filters: { dateFrom: string | null; dateTo: string | null; userId: string | null };
  items: BusinessResponsibilityReportItem[];
}

export interface BusinessReminder {
  kind: "TASK" | "FOLLOW_UP" | "CONTRACT";
  id: string;
  title: string;
  dueAt: string | null;
  overdue: boolean;
  matter: { id: string; title: string; matterNo: string };
}

export interface ExportDocumentsPayload {
  documentIds?: string[];
  categoryId?: string;
}

export interface SearchAssistantResult {
  documentId: string;
  title: string;
  documentNo: string;
  categoryPath: string[];
  matchedBy: string[];
  score: number;
  snippet: string;
  updatedAt: string;
}

export interface SearchAssistantResponse {
  mode: "keyword" | "semantic";
  answer: string;
  results: SearchAssistantResult[];
}

export interface FinancePackageGroupRecord {
  id: string;
  taskId: string;
  name: string;
  parentId: string | null;
  sort: number;
  createdAt: string;
  updatedAt: string;
}

export interface FinancePackageItemRecord {
  id: string;
  taskId: string;
  groupId: string | null;
  documentId: string;
  versionId: string;
  materialType: FinanceMaterialType;
  exportFileName: string | null;
  sort: number;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
  group?: FinancePackageGroupRecord | null;
  version: DocumentVersionRecord;
  document: DocumentRecord;
}

export interface FinancePackageValidationIssue {
  code: "UNGROUPED_FILES" | "OUTDATED_VERSIONS" | "EMPTY_GROUPS" | "DUPLICATE_NAMES";
  level: "warning";
  count: number;
  message: string;
}

export interface FinancePackageValidation {
  groupCount: number;
  itemCount: number;
  ungroupedCount: number;
  outdatedVersionCount: number;
  emptyGroupCount: number;
  duplicateNameCount: number;
  issues: FinancePackageValidationIssue[];
}

export interface FinancePackageExportRecord {
  id: string;
  taskId: string;
  exportedById: string;
  fileName: string;
  fileCount: number;
  createdAt: string;
  exportedBy?: { id: string; username: string; realName: string };
}

export interface FinancePackageTaskRecord {
  id: string;
  name: string;
  period: string;
  rootFolderName: string;
  status: FinancePackageStatus;
  includeManifest: boolean;
  createdById: string;
  lastExportedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; username: string; realName: string };
  groups?: FinancePackageGroupRecord[];
  items?: FinancePackageItemRecord[];
  exports?: FinancePackageExportRecord[];
  validation?: FinancePackageValidation;
  _count?: { groups: number; items: number; exports: number };
}

export interface FinancePackageCandidate {
  document: DocumentRecord;
  materialType: FinanceMaterialType;
  score: number;
  reasons: string[];
}

export interface FinanceAnalysisJobRecord {
  id: string;
  taskId: string;
  status: FinanceAnalysisJobStatus;
  totalCount: number;
  processedCount: number;
  requestCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  durationMs: number | null;
  model: string | null;
  promptVersion: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceAnalysisFields {
  materialType: FinanceMaterialType;
  expensePerson: string | null;
  documentDate: string | null;
  amount: number | null;
  merchant: string | null;
  project: string | null;
  matterKey: string | null;
}

export interface FinanceAnalysisSuggestionRecord {
  id: string;
  jobId: string;
  documentId: string;
  versionId: string;
  suggestedGroupName: string;
  suggestedFileName: string;
  materialType: FinanceMaterialType;
  extractedFields: FinanceAnalysisFields;
  groupingKey: string | null;
  confidence: number | null;
  reasons: string[];
  status: FinanceSuggestionStatus;
  confirmedGroupId: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  document: DocumentRecord;
  version: DocumentVersionRecord;
}

export interface FinanceAnalysisJobDetail extends FinanceAnalysisJobRecord {
  suggestions: FinanceAnalysisSuggestionRecord[];
}
