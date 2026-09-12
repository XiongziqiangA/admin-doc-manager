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
export type BusinessStageStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type BusinessMilestoneStatus = "PLANNED" | "COMPLETED" | "CANCELLED";
export type BusinessProjectHealth = "HEALTHY" | "AT_RISK" | "DELAYED" | "COMPLETED" | "CANCELLED" | "NO_PLAN";
export type BusinessTaskStatus = "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type BusinessTaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type BusinessIssueKind = "RISK" | "ISSUE";
export type BusinessIssueSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type BusinessIssueStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CANCELLED";
export type BusinessFollowUpMethod = "CALL" | "WECHAT" | "EMAIL" | "MEETING" | "ONSITE" | "OTHER";
export type BusinessFinanceKind = "LOAN" | "REIMBURSEMENT";
export type BusinessFinanceStatus = "DRAFT" | "PENDING" | "APPROVED" | "PAID" | "SETTLED" | "REJECTED" | "CANCELLED";
export type BusinessContractStatus = "DRAFT" | "ACTIVE" | "EXPIRED" | "TERMINATED";
export type AssetStatus =
  | "active"
  | "pending"
  | "unavailable"
  | "archived"
  | "scrapped"
  | "lost"
  | "sold"
  | "transferred"
  | "donated";
export type AssetResourceStatus =
  | "available"
  | "reserved"
  | "borrowed"
  | "transferring"
  | "unavailable"
  | "return_pending"
  | "maintenance"
  | "exit_pending"
  | "retired";
export type AssetReservationStatus = "PENDING" | "APPROVED" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "REJECTED" | "EXPIRED";
export type AssetBorrowStatus = "REQUESTED" | "APPROVED" | "ACTIVE" | "RETURN_PENDING" | "RETURNED" | "REJECTED" | "CANCELLED";
export type AssetTransferStatus = "PENDING" | "APPROVED" | "IN_TRANSIT" | "COMPLETED" | "REJECTED" | "CANCELLED";
export type ApprovalBusinessType = "ASSET_INTAKE" | "ASSET_RESERVATION" | "ASSET_BORROW" | "ASSET_TRANSFER" | "ASSET_EXIT";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type AssetInventoryScopeType = "ORGANIZATION" | "DEPARTMENT" | "LOCATION" | "PROJECT" | "ASSET_TYPE" | "ASSET_LIST";
export type AssetInventoryStatus = "OPEN" | "COMPLETED" | "CANCELLED";
export type AssetInventoryResult = "NORMAL" | "SURPLUS" | "MISSING" | "LOCATION_MISMATCH" | "STATUS_MISMATCH" | "OWNER_MISMATCH";
export type AssetMaintenanceType = "REPAIR" | "MAINTENANCE" | "INSPECTION";
export type AssetMaintenanceStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type AssetAnomalyType = "SURPLUS" | "MISSING" | "LOCATION_MISMATCH" | "STATUS_MISMATCH" | "OWNER_MISMATCH" | "DAMAGE" | "OTHER";
export type AssetAnomalySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AssetAnomalyStatus = "OPEN" | "RESOLVED";
export type AssetExitType = "SCRAPPED" | "LOST" | "SOLD" | "TRANSFERRED" | "DONATED" | "CROSS_COMPANY_TRANSFER";
export type AssetExitStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

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

export interface AssetFieldDefinition {
  key: string;
  name: string;
  type: "text" | "number" | "date" | "select" | "boolean";
  required?: boolean;
  options?: string[];
}

export interface AssetTypeRecord {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  parentId: string | null;
  enabled: boolean;
  fieldSchema: AssetFieldDefinition[];
  createdAt: string;
  updatedAt: string;
}

export interface AssetLocationRecord {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  parentId: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssetIdentifierRecord {
  id: string;
  assetId: string;
  identifierType: string;
  value: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface AssetDocumentLink {
  organizationId: string;
  assetId: string;
  documentId: string;
  createdAt: string;
  document: DocumentRecord;
}

export interface AssetRecord {
  id: string;
  organizationId: string;
  businessMatterId: string | null;
  assetTypeId: string;
  departmentId: string | null;
  locationId: string | null;
  assetCode: string;
  name: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  supplier: string | null;
  purchaseDate: string | null;
  purchaseAmount: string | null;
  assetStatus: AssetStatus;
  resourceStatus: AssetResourceStatus;
  ownerUserId: string | null;
  usingUserId: string | null;
  customFields: Record<string, unknown>;
  description: string | null;
  source: string;
  qrToken: string;
  version: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  assetType: AssetTypeRecord;
  department?: { id: string; name: string } | null;
  location?: { id: string; name: string } | null;
  owner?: { id: string; realName: string; username: string } | null;
  usingUser?: { id: string; realName: string; username: string } | null;
  identifiers?: AssetIdentifierRecord[];
  documents?: AssetDocumentLink[];
}

export interface AssetOverview {
  total: number;
  active: number;
  available: number;
  borrowed: number;
  pending: number;
}

export interface WorkspaceOverview {
  generatedAt: string;
  documents: { total: number; monthAdded: number };
  assets: { total: number; active: number; available: number; borrowed: number; maintenance: number; exitPending: number };
  matters: { total: number; inProgress: number };
  tasks: { pending: number; overdue: number; dueSoon: number };
  followUps: { pending: number; overdue: number; dueSoon: number };
  contracts: { dueSoon: number };
  approvals: { pending: number };
  finance: { loanCount: number; loanAmount: string; reimbursementCount: number; reimbursementAmount: string };
  recentDocuments: Array<{ id: string; title: string; documentNo: string; updatedAt: string; category: { name: string } | null; subcategory: { name: string } | null; currentVersion: { fileExt: string; fileSize: number; versionLabel: string } | null }>;
  recentMatters: Array<{ id: string; title: string; matterNo: string; type: BusinessMatterType; status: BusinessMatterStatus; updatedAt: string; owner: { id: string; realName: string; username: string } }>;
  recentAssets: Array<{ id: string; name: string; assetCode: string; assetStatus: AssetStatus; resourceStatus: AssetResourceStatus; updatedAt: string; location: { name: string } | null }>;
}

export interface GlobalSearchResponse {
  query: string;
  results: {
    documents: Array<{ id: string; title: string; documentNo: string; updatedAt: string; categoryPath: string[]; currentVersion: { fileExt: string } | null }>;
    matters: Array<{ id: string; title: string; matterNo: string; type: BusinessMatterType; status: BusinessMatterStatus; updatedAt: string }>;
    assets: Array<{ id: string; name: string; assetCode: string; assetStatus: AssetStatus; resourceStatus: AssetResourceStatus; updatedAt: string }>;
  };
  total: number;
}

export interface NotificationRecord {
  id: string;
  organizationId: string;
  recipientId: string;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface NotificationListResponse {
  items: NotificationRecord[];
  unreadCount: number;
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface AssetEventRecord {
  id: string;
  organizationId: string;
  assetId: string;
  actorId: string | null;
  eventType: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor?: CirculationApplicant | null;
}

export interface AssetInventoryRecord {
  id: string;
  taskId: string;
  assetId: string;
  checkerId: string;
  checkedAt: string;
  checkedLocationId: string | null;
  checkedAssetStatus: string | null;
  checkedOwnerId: string | null;
  result: AssetInventoryResult;
  exceptionTypes: AssetInventoryResult[];
  note: string | null;
  asset: AssetSummary & {
    location?: { id: string; name: string } | null;
    owner?: CirculationApplicant | null;
  };
  checker: CirculationApplicant;
  checkedLocation?: { id: string; name: string } | null;
}

export interface AssetInventoryTaskRecord {
  id: string;
  organizationId: string;
  name: string;
  scopeType: AssetInventoryScopeType;
  scopeValue: { id?: string; assetIds?: string[] } | null;
  plannedStart: string;
  plannedEnd: string;
  ownerId: string;
  status: AssetInventoryStatus;
  createdById: string;
  createdAt: string;
  completedAt: string | null;
  owner: CirculationApplicant;
  createdBy: CirculationApplicant;
  _count: { records: number };
  expectedCount?: number;
  records?: AssetInventoryRecord[];
  anomalies?: AssetAnomalyRecord[];
}

export interface AssetMaintenanceRecord {
  id: string;
  organizationId: string;
  assetId: string;
  maintenanceType: AssetMaintenanceType;
  title: string;
  description: string | null;
  vendor: string | null;
  plannedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cost: string | null;
  status: AssetMaintenanceStatus;
  resourceStatusBefore: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  asset: AssetSummary;
  createdBy: CirculationApplicant;
}

export interface AssetAnomalyRecord {
  id: string;
  organizationId: string;
  assetId: string;
  type: AssetAnomalyType;
  severity: AssetAnomalySeverity;
  status: AssetAnomalyStatus;
  sourceType: string | null;
  sourceId: string | null;
  description: string;
  assignedToId: string | null;
  resolution: string | null;
  createdAt: string;
  closedAt: string | null;
  asset: AssetSummary;
  assignedTo?: CirculationApplicant | null;
}

export interface AssetExitRecord {
  id: string;
  organizationId: string;
  assetId: string;
  applicantId: string;
  approvalId: string | null;
  exitType: AssetExitType;
  reason: string;
  status: AssetExitStatus;
  resourceStatusBefore: string | null;
  createdAt: string;
  completedAt: string | null;
  asset: AssetSummary & { archivedAt?: string | null };
  applicant: CirculationApplicant;
  approval?: { id: string; status: ApprovalStatus; comment: string | null; completedAt: string | null } | null;
}

export interface AssetPendingRecord {
  id: string;
  source: string;
  rawPayload: Record<string, unknown>;
  aiFields: Record<string, unknown> | null;
  confidence: number | null;
  duplicateCandidates: Array<Record<string, unknown>>;
  status: string;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  submittedBy?: { id: string; realName: string } | null;
  reviewedBy?: { id: string; realName: string } | null;
}

export interface AssetSummary {
  id: string;
  assetCode: string;
  name: string;
  version?: number;
  assetStatus?: AssetStatus;
  resourceStatus: AssetResourceStatus;
}

export interface CirculationApplicant {
  id: string;
  realName: string;
  username: string;
}

export interface AssetReservationRecord {
  id: string;
  organizationId: string;
  assetId: string;
  applicantId: string;
  businessMatterId: string | null;
  approvalId: string | null;
  startAt: string;
  endAt: string;
  purpose: string;
  status: AssetReservationStatus;
  cancelReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  asset: AssetSummary;
  applicant: CirculationApplicant;
  businessMatter?: { id: string; matterNo: string; title: string } | null;
  approval?: { id: string; status: ApprovalStatus; comment: string | null; completedAt: string | null } | null;
}

export interface AssetHandoverRecord {
  id: string;
  handoverType: "CHECKOUT" | "RETURN" | "TRANSFER";
  itemsSnapshot: string[];
  note: string | null;
  status: "DRAFT" | "CONFIRMED" | "CANCELLED";
  createdAt: string;
  confirmedAt: string | null;
}

export interface AssetBorrowRecord {
  id: string;
  organizationId: string;
  assetId: string;
  applicantId: string;
  reservationId: string | null;
  businessMatterId: string | null;
  approvalId: string | null;
  borrowStart: string;
  borrowEnd: string;
  actualReturnAt: string | null;
  purpose: string;
  note: string | null;
  status: AssetBorrowStatus;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  asset: AssetSummary;
  applicant: CirculationApplicant;
  reservation?: Pick<AssetReservationRecord, "id" | "startAt" | "endAt" | "status"> | null;
  businessMatter?: { id: string; matterNo: string; title: string } | null;
  approval?: { id: string; status: ApprovalStatus; comment: string | null; completedAt: string | null } | null;
  handovers?: AssetHandoverRecord[];
}

export interface AssetTransferRecord {
  id: string;
  organizationId: string;
  assetId: string;
  approvalId: string | null;
  fromDepartmentId: string | null;
  toDepartmentId: string | null;
  fromLocationId: string | null;
  toLocationId: string | null;
  fromOwnerId: string | null;
  toOwnerId: string | null;
  reason: string;
  status: AssetTransferStatus;
  createdAt: string;
  completedAt: string | null;
  asset: AssetSummary;
  fromDepartment?: { id: string; name: string } | null;
  toDepartment?: { id: string; name: string } | null;
  fromLocation?: { id: string; name: string } | null;
  toLocation?: { id: string; name: string } | null;
  fromOwner?: CirculationApplicant | null;
  toOwner?: CirculationApplicant | null;
  createdBy?: CirculationApplicant;
  approval?: { id: string; status: ApprovalStatus; comment: string | null; completedAt: string | null } | null;
  handovers?: AssetHandoverRecord[];
}

export interface ApprovalActionRecord {
  id: string;
  action: "SUBMIT" | "APPROVE" | "REJECT" | "CANCEL";
  comment: string | null;
  createdAt: string;
  actor: CirculationApplicant;
}

export interface ApprovalRecord {
  id: string;
  organizationId: string;
  businessType: ApprovalBusinessType;
  businessId: string;
  applicantId: string;
  status: ApprovalStatus;
  comment: string | null;
  createdAt: string;
  completedAt: string | null;
  applicant: CirculationApplicant;
  assignedTo?: CirculationApplicant | null;
  actions: ApprovalActionRecord[];
  reservation?: AssetReservationRecord | null;
  borrow?: AssetBorrowRecord | null;
  transfer?: AssetTransferRecord | null;
  exitRequest?: AssetExitRecord | null;
}

export interface AssetListQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  assetTypeId?: string;
  departmentId?: string;
  locationId?: string;
  businessMatterId?: string;
  assetStatus?: AssetStatus;
  resourceStatus?: AssetResourceStatus;
  sortBy?: "updatedAt" | "createdAt" | "name" | "assetCode" | "purchaseAmount";
  sortOrder?: "asc" | "desc";
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
  organizationId?: string | null;
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
  progressSummary?: BusinessProjectProgressSummary;
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
  stageId: string | null;
  milestoneId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  assignee?: BusinessMatterPerson | null;
  createdBy?: BusinessMatterPerson;
  completedBy?: BusinessMatterPerson | null;
  cancelledBy?: BusinessMatterPerson | null;
  documents: BusinessWorkflowDocumentLink[];
  stage?: { id: string; name: string; status: BusinessStageStatus; progress: number } | null;
  milestone?: { id: string; title: string; status: BusinessMilestoneStatus; dueDate: string | null } | null;
}

export interface BusinessStageRecord {
  id: string;
  matterId: string;
  name: string;
  description: string | null;
  status: BusinessStageStatus;
  progress: number;
  calculatedProgress: number;
  sort: number;
  startDate: string | null;
  endDate: string | null;
  ownerId: string | null;
  ownerName: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  owner?: BusinessMatterPerson | null;
  createdBy?: BusinessMatterPerson;
  taskCount: number;
}

export interface BusinessMilestoneRecord {
  id: string;
  matterId: string;
  stageId: string | null;
  title: string;
  description: string | null;
  status: BusinessMilestoneStatus;
  dueDate: string | null;
  completedAt: string | null;
  completedById: string | null;
  ownerId: string | null;
  ownerName: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  stage?: { id: string; name: string } | null;
  owner?: BusinessMatterPerson | null;
  createdBy?: BusinessMatterPerson;
  completedBy?: BusinessMatterPerson | null;
}

export interface BusinessProjectProgressSummary {
  progress: number;
  health: BusinessProjectHealth;
  delayed: boolean;
  stageCount: number;
  completedStageCount: number;
  milestoneCount: number;
  completedMilestoneCount: number;
  overdueTaskCount: number;
  overdueMilestoneCount: number;
}

export interface BusinessProjectPlan {
  summary: BusinessProjectProgressSummary;
  stages: BusinessStageRecord[];
  milestones: BusinessMilestoneRecord[];
  tasks: Array<Pick<BusinessTaskRecord, "id" | "title" | "stageId" | "milestoneId" | "progress" | "status" | "dueDate">>;
  contract: {
    id: string;
    contractNo: string | null;
    partyName: string;
    expiresAt: string | null;
    status: BusinessContractStatus;
  } | null;
}

export interface BusinessIssueDocumentLink {
  issueId: string;
  documentId: string;
  versionId: string | null;
  relationType: string;
  createdAt: string;
  document: DocumentRecord;
  version?: DocumentVersionRecord | null;
}

export interface BusinessIssueRecord {
  id: string;
  matterId: string;
  kind: BusinessIssueKind;
  title: string;
  description: string | null;
  severity: BusinessIssueSeverity;
  status: BusinessIssueStatus;
  ownerId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  resolvedById: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  owner?: BusinessMatterPerson | null;
  createdBy?: BusinessMatterPerson;
  resolvedBy?: BusinessMatterPerson | null;
  documents: BusinessIssueDocumentLink[];
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
