import { describe, expect, it } from "vitest";

import {
  buildFinancePackageEntryName,
  getFinanceGroupPath,
  inferFinanceMaterialType,
  scoreFinanceCandidate,
  validateFinancePackageLayout,
} from "./finance-package-export";

describe("finance package export helpers", () => {
  const groups = [
    { id: "group-1", parentId: null, name: "丁红军出差报销" },
    { id: "group-2", parentId: "group-1", name: "车票" },
    { id: "group-3", parentId: null, name: "钱塘酒店住宿" },
  ];

  it("builds a readable nested Chinese group path", () => {
    expect(getFinanceGroupPath(groups, "group-2")).toEqual(["丁红军出差报销", "车票"]);
  });

  it("places ungrouped files directly under the configured root folder", () => {
    expect(
      buildFinancePackageEntryName(
        {
          rootFolderName: "我界报销单(打包）",
          groupPath: [],
          fileName: "陈曦提交的备用金.pdf",
        },
        new Set(),
      ),
    ).toBe("我界报销单(打包）/陈曦提交的备用金.pdf");
  });

  it("deduplicates file names only within the same target folder", () => {
    const used = new Set<string>();
    const first = buildFinancePackageEntryName(
      { rootFolderName: "报销资料", groupPath: ["工作餐"], fileName: "付款单.pdf" },
      used,
    );
    const duplicate = buildFinancePackageEntryName(
      { rootFolderName: "报销资料", groupPath: ["工作餐"], fileName: "付款单.pdf" },
      used,
    );
    const anotherFolder = buildFinancePackageEntryName(
      { rootFolderName: "报销资料", groupPath: ["酒店住宿"], fileName: "付款单.pdf" },
      used,
    );

    expect(first).toBe("报销资料/工作餐/付款单.pdf");
    expect(duplicate).toBe("报销资料/工作餐/付款单 (2).pdf");
    expect(anotherFolder).toBe("报销资料/酒店住宿/付款单.pdf");
  });

  it("prevents export names from escaping the package root", () => {
    expect(
      buildFinancePackageEntryName(
        { rootFolderName: "../报销资料", groupPath: ["餐饮/住宿"], fileName: "../../发票?.pdf" },
        new Set(),
      ),
    ).toBe("_报销资料/餐饮_住宿/_.._发票_.pdf");
  });

  it.each([
    ["熊子强提交的日常报销.pdf", "REIMBURSEMENT_FORM"],
    ["18000-临平桔子酒店发票.pdf", "INVOICE"],
    ["陈曦提交的付款单.pdf", "PAYMENT_FORM"],
    ["汉口到杭州东车票1.pdf", "TICKET"],
    ["采购合同.docx", "CONTRACT"],
    ["银行电子回单.ofd", "BANK_RECEIPT"],
    ["补充说明.txt", "OTHER"],
  ])("infers %s as %s", (fileName, expected) => {
    expect(inferFinanceMaterialType(fileName)).toBe(expected);
  });

  it("reports ungrouped, outdated, empty-group and duplicate-name warnings", () => {
    const result = validateFinancePackageLayout(groups, [
      {
        id: "item-1",
        groupId: "group-2",
        exportFileName: null,
        originalFileName: "付款单.pdf",
        versionId: "version-1",
        currentVersionId: "version-2",
      },
      {
        id: "item-2",
        groupId: "group-2",
        exportFileName: "付款单.pdf",
        originalFileName: "其他名称.pdf",
        versionId: "version-3",
        currentVersionId: "version-3",
      },
      {
        id: "item-3",
        groupId: null,
        exportFileName: null,
        originalFileName: "备用金.pdf",
        versionId: "version-4",
        currentVersionId: "version-4",
      },
    ]);

    expect(result).toMatchObject({
      groupCount: 3,
      itemCount: 3,
      ungroupedCount: 1,
      outdatedVersionCount: 1,
      emptyGroupCount: 1,
      duplicateNameCount: 1,
    });
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "UNGROUPED_FILES",
      "OUTDATED_VERSIONS",
      "EMPTY_GROUPS",
      "DUPLICATE_NAMES",
    ]);
  });

  it("ranks month, file-name, category and tag matches with explainable reasons", () => {
    const result = scoreFinanceCandidate(
      {
        title: "临平酒店住宿",
        originalFileName: "18000-临平桔子酒店发票.pdf",
        categoryName: "财务资料",
        subcategoryName: "费用报销",
        tagNames: ["8月报销"],
        remark: null,
        extractedText: "杭州我界智能科技有限公司",
        createdAt: "2026-08-18T08:00:00.000Z",
        updatedAt: "2026-08-18T08:00:00.000Z",
      },
      "2026-08",
      "酒店",
    );

    expect(result.score).toBeGreaterThanOrEqual(100);
    expect(result.reasons).toEqual(expect.arrayContaining(["归集月份", "文件名匹配", "财务关键词", "财务分类"]));
  });

  it("does not recommend unrelated files outside the target month", () => {
    expect(
      scoreFinanceCandidate(
        {
          title: "员工手册",
          originalFileName: "员工手册.docx",
          categoryName: "制度文件",
          subcategoryName: null,
          tagNames: [],
          remark: null,
          extractedText: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        "2026-08",
      ),
    ).toEqual({ score: 0, reasons: [] });
  });
});
