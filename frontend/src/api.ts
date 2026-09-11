import axios, { AxiosRequestConfig } from "axios";

import type {
  ApiEnvelope,
  ApiList,
  AssetListQuery,
  AssetIdentifierRecord,
  AssetLocationRecord,
  AssetOverview,
  AssetRecord,
  AssetTypeRecord,
  AssetPendingRecord,
  BusinessMatterDetail,
  BusinessProjectPlan,
  BusinessMatterDocumentLink,
  BusinessMatterRecord,
  BusinessStageRecord,
  BusinessMilestoneRecord,
  BusinessActivityRecord,
  BusinessContractRecord,
  BusinessFollowUpRecord,
  BusinessFinanceDocumentLink,
  BusinessFinanceRecord,
  BusinessIssueDocumentLink,
  BusinessIssueRecord,
  BusinessWorkflowDocumentLink,
  BusinessReminder,
  BusinessResponsibilityReport,
  BusinessTaskRecord,
  BusinessWorkflowOverview,
  CategoryNode,
  DepartmentRecord,
  DocumentListQuery,
  DocumentLogRecord,
  DocumentRecord,
  DocumentVersionRecord,
  ExportDocumentsPayload,
  FinanceMaterialType,
  FinanceAiConfig,
  FinanceAiVerification,
  FinanceAnalysisJobDetail,
  FinanceAnalysisJobRecord,
  FinancePackageCandidate,
  FinancePackageGroupRecord,
  FinancePackageItemRecord,
  FinancePackageTaskRecord,
  LoginResult,
  PartnerRecord,
  PublicUser,
  SearchAssistantResponse,
  TagRecord,
  UserRecord,
} from "./types";

const TOKEN_KEY = "enterprise-admin-docs.token";
const USER_KEY = "enterprise-admin-docs.user";

export const api = axios.create({
  baseURL: "/api",
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      clearStoredAuth();
      window.dispatchEvent(new Event("auth:logout"));
    }
    return Promise.reject(error);
  },
);

export function getStoredToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as PublicUser;
  } catch {
    return null;
  }
}

export function setStoredAuth(token: string, user: PublicUser) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredAuth() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function isAuthError(error: unknown) {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await api.request<ApiEnvelope<T>>(config);
  return response.data.data;
}

export async function login(username: string, password: string) {
  return request<LoginResult>({
    method: "POST",
    url: "/auth/login",
    data: { username, password },
  });
}

export async function getMe() {
  return request<PublicUser>({ method: "GET", url: "/auth/me" });
}

export async function listDocuments(query: DocumentListQuery, recycle = false) {
  return request<ApiList<DocumentRecord>>({
    method: "GET",
    url: recycle ? "/documents/recycle" : "/documents",
    params: query,
  });
}

export async function listAssets(query: AssetListQuery) {
  return request<ApiList<AssetRecord>>({ method: "GET", url: "/assets", params: query });
}

export async function getAsset(id: string) {
  return request<AssetRecord>({ method: "GET", url: `/assets/${id}` });
}

export async function getAssetOverview() {
  return request<AssetOverview>({ method: "GET", url: "/assets/overview" });
}

export async function attachAssetDocuments(assetId: string, documentIds: string[]) {
  return request<{ assetId: string; addedCount: number }>({
    method: "POST",
    url: `/assets/${assetId}/documents`,
    data: { documentIds },
  });
}

export async function detachAssetDocument(assetId: string, documentId: string) {
  return request<void>({ method: "DELETE", url: `/assets/${assetId}/documents/${documentId}` });
}

export async function listAssetTypes(includeDisabled = false) {
  return request<AssetTypeRecord[]>({
    method: "GET",
    url: "/assets/types",
    params: { includeDisabled },
  });
}

export async function listAssetLocations(includeDisabled = false) {
  return request<AssetLocationRecord[]>({
    method: "GET",
    url: "/assets/locations",
    params: { includeDisabled },
  });
}

export async function createAsset(payload: Record<string, unknown>) {
  return request<AssetRecord>({ method: "POST", url: "/assets", data: payload });
}

export async function updateAsset(id: string, payload: Record<string, unknown>) {
  return request<AssetRecord>({ method: "PATCH", url: `/assets/${id}`, data: payload });
}

export async function listPendingAssets(status = "pending") {
  return request<AssetPendingRecord[]>({
    method: "GET",
    url: "/assets/pending",
    params: { status },
  });
}

export async function createPendingAsset(payload: Record<string, unknown>) {
  return request<AssetPendingRecord>({ method: "POST", url: "/assets/pending", data: payload });
}

export async function confirmPendingAsset(id: string, payload: Record<string, unknown>) {
  return request<AssetRecord>({ method: "POST", url: `/assets/pending/${id}/confirm`, data: payload });
}

export async function createAssetType(payload: Record<string, unknown>) {
  return request<AssetTypeRecord>({ method: "POST", url: "/assets/types", data: payload });
}

export async function updateAssetType(id: string, payload: Record<string, unknown>) {
  return request<AssetTypeRecord>({ method: "PATCH", url: `/assets/types/${id}`, data: payload });
}

export async function createAssetLocation(payload: Record<string, unknown>) {
  return request<AssetLocationRecord>({ method: "POST", url: "/assets/locations", data: payload });
}

export async function updateAssetLocation(id: string, payload: Record<string, unknown>) {
  return request<AssetLocationRecord>({ method: "PATCH", url: `/assets/locations/${id}`, data: payload });
}

export async function disableAssetLocation(id: string) {
  return request<AssetLocationRecord>({ method: "DELETE", url: `/assets/locations/${id}` });
}

export async function createAssetIdentifier(assetId: string, payload: Record<string, unknown>) {
  return request<AssetIdentifierRecord>({
    method: "POST",
    url: `/assets/${assetId}/identifiers`,
    data: payload,
  });
}

export async function updateAssetIdentifier(
  assetId: string,
  identifierId: string,
  payload: Record<string, unknown>,
) {
  return request<AssetIdentifierRecord>({
    method: "PATCH",
    url: `/assets/${assetId}/identifiers/${identifierId}`,
    data: payload,
  });
}

export async function deleteAssetIdentifier(assetId: string, identifierId: string) {
  return request<void>({
    method: "DELETE",
    url: `/assets/${assetId}/identifiers/${identifierId}`,
  });
}

export async function listBusinessMatters(params: Record<string, string | number | undefined> = {}) {
  return request<ApiList<BusinessMatterRecord>>({
    method: "GET",
    url: "/business-matters",
    params: { page: 1, pageSize: 20, ...params },
  });
}

export async function getBusinessMatter(id: string) {
  return request<BusinessMatterDetail>({ method: "GET", url: `/business-matters/${id}` });
}

export async function getBusinessProjectPlan(id: string) {
  return request<BusinessProjectPlan>({ method: "GET", url: `/business-matters/${id}/project-plan` });
}

export async function createBusinessMatter(payload: Record<string, unknown>) {
  return request<BusinessMatterRecord>({ method: "POST", url: "/business-matters", data: payload });
}

export async function updateBusinessMatter(id: string, payload: Record<string, unknown>) {
  return request<BusinessMatterRecord>({ method: "PATCH", url: `/business-matters/${id}`, data: payload });
}

export async function deleteBusinessMatter(id: string) {
  return request<BusinessMatterRecord>({ method: "DELETE", url: `/business-matters/${id}` });
}

export async function attachBusinessMatterDocuments(
  id: string,
  payload: { documentIds: string[]; relationType?: string; isPrimary?: boolean },
) {
  return request<{ matterId: string; addedCount: number }>({
    method: "POST",
    url: `/business-matters/${id}/documents`,
    data: payload,
  });
}

export async function detachBusinessMatterDocument(id: string, documentId: string) {
  return request<BusinessMatterDocumentLink>({
    method: "DELETE",
    url: `/business-matters/${id}/documents/${documentId}`,
  });
}

export async function createBusinessStage(matterId: string, payload: Record<string, unknown>) {
  return request<BusinessStageRecord>({ method: "POST", url: `/business-matters/${matterId}/stages`, data: payload });
}

export async function updateBusinessStage(matterId: string, stageId: string, payload: Record<string, unknown>) {
  return request<BusinessStageRecord>({ method: "PATCH", url: `/business-matters/${matterId}/stages/${stageId}`, data: payload });
}

export async function deleteBusinessStage(matterId: string, stageId: string) {
  return request<BusinessStageRecord>({ method: "DELETE", url: `/business-matters/${matterId}/stages/${stageId}` });
}

export async function createBusinessMilestone(matterId: string, payload: Record<string, unknown>) {
  return request<BusinessMilestoneRecord>({ method: "POST", url: `/business-matters/${matterId}/milestones`, data: payload });
}

export async function updateBusinessMilestone(matterId: string, milestoneId: string, payload: Record<string, unknown>) {
  return request<BusinessMilestoneRecord>({ method: "PATCH", url: `/business-matters/${matterId}/milestones/${milestoneId}`, data: payload });
}

export async function deleteBusinessMilestone(matterId: string, milestoneId: string) {
  return request<BusinessMilestoneRecord>({ method: "DELETE", url: `/business-matters/${matterId}/milestones/${milestoneId}` });
}

export async function listBusinessTasks(matterId: string, params: Record<string, string | number | undefined> = {}) {
  return request<ApiList<BusinessTaskRecord>>({
    method: "GET",
    url: `/business-matters/${matterId}/tasks`,
    params: { page: 1, pageSize: 50, ...params },
  });
}

export async function createBusinessTask(matterId: string, payload: Record<string, unknown>) {
  return request<BusinessTaskRecord>({ method: "POST", url: `/business-matters/${matterId}/tasks`, data: payload });
}

export async function updateBusinessTask(matterId: string, taskId: string, payload: Record<string, unknown>) {
  return request<BusinessTaskRecord>({ method: "PATCH", url: `/business-matters/${matterId}/tasks/${taskId}`, data: payload });
}

export async function deleteBusinessTask(matterId: string, taskId: string) {
  return request<BusinessTaskRecord>({ method: "DELETE", url: `/business-matters/${matterId}/tasks/${taskId}` });
}

export async function attachBusinessTaskDocuments(
  matterId: string,
  taskId: string,
  payload: { documentIds: string[]; relationType?: string },
) {
  return request<{ taskId: string; addedCount: number }>({
    method: "POST",
    url: `/business-matters/${matterId}/tasks/${taskId}/documents`,
    data: payload,
  });
}

export async function detachBusinessTaskDocument(matterId: string, taskId: string, documentId: string) {
  return request<BusinessWorkflowDocumentLink>({
    method: "DELETE",
    url: `/business-matters/${matterId}/tasks/${taskId}/documents/${documentId}`,
  });
}

export async function listBusinessIssues(matterId: string, params: Record<string, string | number | undefined> = {}) {
  return request<ApiList<BusinessIssueRecord>>({
    method: "GET",
    url: `/business-matters/${matterId}/issues`,
    params: { page: 1, pageSize: 100, ...params },
  });
}

export async function createBusinessIssue(matterId: string, payload: Record<string, unknown>) {
  return request<BusinessIssueRecord>({ method: "POST", url: `/business-matters/${matterId}/issues`, data: payload });
}

export async function updateBusinessIssue(matterId: string, issueId: string, payload: Record<string, unknown>) {
  return request<BusinessIssueRecord>({ method: "PATCH", url: `/business-matters/${matterId}/issues/${issueId}`, data: payload });
}

export async function deleteBusinessIssue(matterId: string, issueId: string) {
  return request<BusinessIssueRecord>({ method: "DELETE", url: `/business-matters/${matterId}/issues/${issueId}` });
}

export async function attachBusinessIssueDocuments(
  matterId: string,
  issueId: string,
  payload: { documentIds: string[]; relationType?: string },
) {
  return request<{ issueId: string; addedCount: number }>({
    method: "POST",
    url: `/business-matters/${matterId}/issues/${issueId}/documents`,
    data: payload,
  });
}

export async function detachBusinessIssueDocument(matterId: string, issueId: string, documentId: string) {
  return request<BusinessIssueDocumentLink>({
    method: "DELETE",
    url: `/business-matters/${matterId}/issues/${issueId}/documents/${documentId}`,
  });
}

export async function listBusinessFollowUps(matterId: string, params: Record<string, string | number | undefined> = {}) {
  return request<ApiList<BusinessFollowUpRecord>>({
    method: "GET",
    url: `/business-matters/${matterId}/follow-ups`,
    params: { page: 1, pageSize: 50, ...params },
  });
}

export async function createBusinessFollowUp(matterId: string, payload: Record<string, unknown>) {
  return request<BusinessFollowUpRecord>({ method: "POST", url: `/business-matters/${matterId}/follow-ups`, data: payload });
}

export async function attachBusinessFollowUpDocuments(
  matterId: string,
  followUpId: string,
  payload: { documentIds: string[]; relationType?: string },
) {
  return request<{ followUpId: string; addedCount: number }>({
    method: "POST",
    url: `/business-matters/${matterId}/follow-ups/${followUpId}/documents`,
    data: payload,
  });
}

export async function detachBusinessFollowUpDocument(matterId: string, followUpId: string, documentId: string) {
  return request<BusinessWorkflowDocumentLink>({
    method: "DELETE",
    url: `/business-matters/${matterId}/follow-ups/${followUpId}/documents/${documentId}`,
  });
}

export async function getBusinessContract(matterId: string) {
  return request<BusinessContractRecord | null>({ method: "GET", url: `/business-matters/${matterId}/contract` });
}

export async function upsertBusinessContract(matterId: string, payload: Record<string, unknown>) {
  return request<BusinessContractRecord>({ method: "PUT", url: `/business-matters/${matterId}/contract`, data: payload });
}

export async function deleteBusinessContract(matterId: string) {
  return request<BusinessContractRecord>({ method: "DELETE", url: `/business-matters/${matterId}/contract` });
}

export async function listBusinessFinanceRecords(matterId: string, params: Record<string, string | number | undefined> = {}) {
  return request<ApiList<BusinessFinanceRecord>>({
    method: "GET",
    url: `/business-matters/${matterId}/finance-records`,
    params: { page: 1, pageSize: 50, ...params },
  });
}

export async function createBusinessFinanceRecord(matterId: string, payload: Record<string, unknown>) {
  return request<BusinessFinanceRecord>({ method: "POST", url: `/business-matters/${matterId}/finance-records`, data: payload });
}

export async function updateBusinessFinanceRecord(matterId: string, recordId: string, payload: Record<string, unknown>) {
  return request<BusinessFinanceRecord>({ method: "PATCH", url: `/business-matters/${matterId}/finance-records/${recordId}`, data: payload });
}

export async function deleteBusinessFinanceRecord(matterId: string, recordId: string) {
  return request<BusinessFinanceRecord>({ method: "DELETE", url: `/business-matters/${matterId}/finance-records/${recordId}` });
}

export async function attachBusinessFinanceDocuments(
  matterId: string,
  recordId: string,
  payload: { documentIds: string[]; relationType?: string },
) {
  return request<{ recordId: string; addedCount: number }>({
    method: "POST",
    url: `/business-matters/${matterId}/finance-records/${recordId}/documents`,
    data: payload,
  });
}

export async function detachBusinessFinanceDocument(matterId: string, recordId: string, documentId: string) {
  return request<BusinessFinanceDocumentLink>({
    method: "DELETE",
    url: `/business-matters/${matterId}/finance-records/${recordId}/documents/${documentId}`,
  });
}

export async function listBusinessActivities(matterId: string, params: { page?: number; pageSize?: number } = {}) {
  return request<ApiList<BusinessActivityRecord>>({
    method: "GET",
    url: `/business-matters/${matterId}/activities`,
    params: { page: 1, pageSize: 30, ...params },
  });
}

export async function getBusinessWorkflowOverview() {
  return request<BusinessWorkflowOverview>({ method: "GET", url: "/business-workflow/overview" });
}

export async function getBusinessResponsibilityReport(params: { dateFrom?: string; dateTo?: string; userId?: string } = {}) {
  return request<BusinessResponsibilityReport>({ method: "GET", url: "/business-workflow/responsibility-report", params });
}

export async function exportBusinessResponsibilityReport(params: { dateFrom?: string; dateTo?: string; userId?: string } = {}) {
  const response = await api.get<Blob>("/business-workflow/responsibility-report/export", {
    params,
    responseType: "blob",
  });
  return {
    blob: response.data,
    fileName: parseContentDispositionFileName(response.headers["content-disposition"]) ?? "责任统计报表.csv",
  };
}

export async function listBusinessReminders() {
  return request<{ generatedAt: string; items: BusinessReminder[] }>({ method: "GET", url: "/business-workflow/reminders" });
}

export async function getDocument(id: string) {
  return request<DocumentRecord>({ method: "GET", url: `/documents/${id}` });
}

export async function findDuplicateDocuments(fileName: string) {
  return request<DocumentRecord[]>({
    method: "GET",
    url: "/documents/duplicates",
    params: { fileName },
  });
}

export async function listDocumentVersions(id: string) {
  return request<DocumentVersionRecord[]>({ method: "GET", url: `/documents/${id}/versions` });
}

export async function listDocumentLogs(query: Record<string, string | number | undefined>) {
  return request<ApiList<DocumentLogRecord>>({ method: "GET", url: "/document-logs", params: query });
}

export async function uploadDocument(formData: FormData) {
  return request<DocumentRecord>({
    method: "POST",
    url: "/documents/upload",
    data: formData,
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export async function updateDocument(id: string, payload: Record<string, unknown>) {
  return request<DocumentRecord>({
    method: "PATCH",
    url: `/documents/${id}`,
    data: payload,
  });
}

export async function uploadDocumentVersion(id: string, formData: FormData) {
  return request<DocumentVersionRecord>({
    method: "POST",
    url: `/documents/${id}/versions`,
    data: formData,
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export async function deleteDocument(id: string) {
  return request<DocumentRecord>({ method: "DELETE", url: `/documents/${id}` });
}

export async function restoreDocument(id: string) {
  return request<DocumentRecord>({ method: "POST", url: `/documents/${id}/restore` });
}

export async function permanentlyDeleteDocument(id: string) {
  return request<{ id: string; deletedFileCount: number; expectedFileCount: number }>({
    method: "DELETE",
    url: `/documents/${id}/permanent`,
  });
}

export async function suggestDocumentNo(categoryId: string) {
  return request<{ documentNo: string }>({
    method: "GET",
    url: "/documents/document-no/suggestion",
    params: { categoryId },
  });
}

export async function listCategories() {
  return request<CategoryNode[]>({ method: "GET", url: "/categories" });
}

export async function createCategory(payload: Record<string, unknown>) {
  return request<CategoryNode>({
    method: "POST",
    url: "/categories",
    data: payload,
  });
}

export async function updateCategory(id: string, payload: Record<string, unknown>) {
  return request<CategoryNode>({
    method: "PATCH",
    url: `/categories/${id}`,
    data: payload,
  });
}

export async function deleteCategory(id: string) {
  return request<CategoryNode>({
    method: "DELETE",
    url: `/categories/${id}`,
  });
}

export async function listPartners() {
  return request<ApiList<PartnerRecord>>({
    method: "GET",
    url: "/partners",
    params: { page: 1, pageSize: 100 },
  });
}

export async function createPartner(payload: Record<string, unknown>) {
  return request<PartnerRecord>({
    method: "POST",
    url: "/partners",
    data: payload,
  });
}

export async function updatePartner(id: string, payload: Record<string, unknown>) {
  return request<PartnerRecord>({
    method: "PATCH",
    url: `/partners/${id}`,
    data: payload,
  });
}

export async function deletePartner(id: string) {
  return request<PartnerRecord>({
    method: "DELETE",
    url: `/partners/${id}`,
  });
}

export async function listTags() {
  return request<TagRecord[]>({ method: "GET", url: "/tags" });
}

export async function createTag(payload: Record<string, unknown>) {
  return request<TagRecord>({
    method: "POST",
    url: "/tags",
    data: payload,
  });
}

export async function updateTag(id: string, payload: Record<string, unknown>) {
  return request<TagRecord>({
    method: "PATCH",
    url: `/tags/${id}`,
    data: payload,
  });
}

export async function deleteTag(id: string) {
  return request<TagRecord>({
    method: "DELETE",
    url: `/tags/${id}`,
  });
}

export async function mergeTags(sourceId: string, targetId: string) {
  return request<TagRecord>({
    method: "POST",
    url: `/tags/${sourceId}/merge/${targetId}`,
  });
}

export async function listDepartments() {
  return request<DepartmentRecord[]>({ method: "GET", url: "/departments" });
}

export async function createDepartment(payload: Record<string, unknown>) {
  return request<DepartmentRecord>({
    method: "POST",
    url: "/departments",
    data: payload,
  });
}

export async function updateDepartment(id: string, payload: Record<string, unknown>) {
  return request<DepartmentRecord>({
    method: "PATCH",
    url: `/departments/${id}`,
    data: payload,
  });
}

export async function deleteDepartment(id: string) {
  return request<DepartmentRecord>({
    method: "DELETE",
    url: `/departments/${id}`,
  });
}

export async function listUsers() {
  return request<ApiList<UserRecord>>({
    method: "GET",
    url: "/users",
    params: { page: 1, pageSize: 200 },
  });
}

export async function createUser(payload: Record<string, unknown>) {
  return request<UserRecord>({
    method: "POST",
    url: "/users",
    data: payload,
  });
}

export async function updateUserStatus(id: string, status: "ACTIVE" | "DISABLED") {
  return request<UserRecord>({
    method: "PATCH",
    url: `/users/${id}/status`,
    data: { status },
  });
}

export async function downloadDocumentBlob(id: string, versionId?: string, preview = false) {
  const response = await api.get<Blob>(`/documents/${id}/${preview ? "preview" : "download"}`, {
    params: versionId ? { versionId } : undefined,
    responseType: "blob",
  });
  return response.data;
}

export async function exportDocumentsBlob(payload: ExportDocumentsPayload) {
  const response = await api.post<Blob>("/documents/export", payload, {
    responseType: "blob",
    timeout: 0,
  });
  return {
    blob: response.data,
    fileName: parseContentDispositionFileName(response.headers["content-disposition"]) ?? "行政资料导出.zip",
  };
}

export async function listFinancePackages(params: { page?: number; pageSize?: number; period?: string } = {}) {
  return request<ApiList<FinancePackageTaskRecord>>({
    method: "GET",
    url: "/finance-packages",
    params: { page: 1, pageSize: 100, ...params },
  });
}

export async function getFinancePackage(id: string) {
  return request<FinancePackageTaskRecord>({ method: "GET", url: `/finance-packages/${id}` });
}

export async function createFinancePackage(payload: {
  name: string;
  period: string;
  rootFolderName: string;
  includeManifest: boolean;
  copyGroupsFromTaskId?: string;
}) {
  return request<FinancePackageTaskRecord>({ method: "POST", url: "/finance-packages", data: payload });
}

export async function updateFinancePackage(
  id: string,
  payload: Partial<Pick<FinancePackageTaskRecord, "name" | "period" | "rootFolderName" | "includeManifest">>,
) {
  return request<FinancePackageTaskRecord>({ method: "PATCH", url: `/finance-packages/${id}`, data: payload });
}

export async function deleteFinancePackage(id: string) {
  return request<FinancePackageTaskRecord>({ method: "DELETE", url: `/finance-packages/${id}` });
}

export async function createFinancePackageGroup(
  taskId: string,
  payload: { name: string; parentId?: string; sort?: number },
) {
  return request<FinancePackageGroupRecord>({
    method: "POST",
    url: `/finance-packages/${taskId}/groups`,
    data: payload,
  });
}

export async function updateFinancePackageGroup(
  taskId: string,
  groupId: string,
  payload: { name?: string; sort?: number },
) {
  return request<FinancePackageGroupRecord>({
    method: "PATCH",
    url: `/finance-packages/${taskId}/groups/${groupId}`,
    data: payload,
  });
}

export async function deleteFinancePackageGroup(taskId: string, groupId: string) {
  return request<FinancePackageGroupRecord>({
    method: "DELETE",
    url: `/finance-packages/${taskId}/groups/${groupId}`,
  });
}

export async function listFinancePackageCandidates(
  taskId: string,
  params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    categoryId?: string;
    subcategoryId?: string;
    departmentId?: string;
    tagId?: string;
    materialType?: FinanceMaterialType;
    uploadedFrom?: string;
    uploadedTo?: string;
  } = {},
) {
  return request<ApiList<FinancePackageCandidate>>({
    method: "GET",
    url: `/finance-packages/${taskId}/candidates`,
    params: { page: 1, pageSize: 50, ...params },
  });
}

export async function startFinanceAnalysis(taskId: string, documentIds?: string[]) {
  return request<FinanceAnalysisJobRecord>({
    method: "POST",
    url: `/finance-packages/${taskId}/analysis`,
    data: documentIds?.length ? { documentIds } : {},
  });
}

export async function getFinanceAiConfig() {
  return request<FinanceAiConfig>({ method: "GET", url: "/finance-packages/ai/config" });
}

export async function updateFinanceAiConfig(payload: {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey?: string;
  clearApiKey?: boolean;
}) {
  return request<FinanceAiConfig>({ method: "PATCH", url: "/finance-packages/ai/config", data: payload });
}

export async function resetFinanceAiConfig() {
  return request<FinanceAiConfig>({ method: "DELETE", url: "/finance-packages/ai/config" });
}

export async function testFinanceAiConfig() {
  return request<FinanceAiVerification>({
    method: "POST",
    url: "/finance-packages/ai/config/test",
    timeout: 0,
  });
}

export async function verifyFinanceAiConfig() {
  return request<FinanceAiVerification>({
    method: "POST",
    url: "/finance-packages/ai/config/verify",
    timeout: 0,
  });
}

export async function listFinanceAiModels() {
  return request<{ models: string[]; durationMs: number }>({
    method: "GET",
    url: "/finance-packages/ai/config/models",
    timeout: 0,
  });
}

export async function getFinanceAnalysis(taskId: string, jobId: string) {
  return request<FinanceAnalysisJobDetail>({
    method: "GET",
    url: `/finance-packages/${taskId}/analysis/${jobId}`,
  });
}

export async function confirmFinanceAnalysis(
  taskId: string,
  jobId: string,
  payload: {
    createGroups: boolean;
    suggestions: Array<{
      suggestionId: string;
      decision: "CONFIRM" | "REJECT";
      groupId?: string | null;
      groupName?: string;
      materialType?: FinanceMaterialType;
      exportFileName?: string;
      remark?: string;
    }>;
  },
) {
  return request<{
    jobId: string;
    confirmedCount: number;
    rejectedCount: number;
    skippedExistingCount: number;
    createdGroupCount: number;
  }>({
    method: "POST",
    url: `/finance-packages/${taskId}/analysis/${jobId}/confirm`,
    data: payload,
  });
}

export async function addFinancePackageItems(
  taskId: string,
  payload: { documentIds: string[]; groupId?: string | null; materialType?: FinanceMaterialType },
) {
  return request<{ addedCount: number; skippedCount: number }>({
    method: "POST",
    url: `/finance-packages/${taskId}/items`,
    data: payload,
  });
}

export async function updateFinancePackageItem(
  taskId: string,
  itemId: string,
  payload: {
    groupId?: string | null;
    materialType?: FinanceMaterialType;
    exportFileName?: string | null;
    sort?: number;
    remark?: string | null;
    useLatestVersion?: boolean;
  },
) {
  return request<FinancePackageItemRecord>({
    method: "PATCH",
    url: `/finance-packages/${taskId}/items/${itemId}`,
    data: payload,
  });
}

export async function deleteFinancePackageItem(taskId: string, itemId: string) {
  return request<FinancePackageItemRecord>({
    method: "DELETE",
    url: `/finance-packages/${taskId}/items/${itemId}`,
  });
}

export async function exportFinancePackageBlob(taskId: string) {
  const response = await api.post<Blob>(`/finance-packages/${taskId}/export`, undefined, {
    responseType: "blob",
    timeout: 0,
  });
  return {
    blob: response.data,
    fileName: parseContentDispositionFileName(response.headers["content-disposition"]) ?? "财务资料交付包.zip",
  };
}

export async function rebuildDocumentContentIndex() {
  return request<{ total: number; ready: number; unsupported: number; failed: number; embeddingFailed: number }>({
    method: "POST",
    url: "/search/index/rebuild",
    timeout: 0,
  });
}

export async function searchWithAssistant(query: string, limit = 10) {
  return request<SearchAssistantResponse>({
    method: "POST",
    url: "/search/assistant",
    data: { query, limit },
  });
}

function parseContentDispositionFileName(header: string | undefined) {
  if (!header) {
    return null;
  }
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const fallbackMatch = header.match(/filename="?([^";]+)"?/i);
  return fallbackMatch?.[1] ?? null;
}

export function formatApiError(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string | string[] } | undefined)?.message;
    if (Array.isArray(message)) {
      return message.join("；");
    }
    return message ?? error.message ?? "请求失败";
  }
  return "请求失败";
}
