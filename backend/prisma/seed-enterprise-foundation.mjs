import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_ORGANIZATION = {
  id: "00000000-0000-4000-8000-000000000001",
  code: "DEFAULT",
  name: process.env.ORGANIZATION_NAME ?? "当前企业",
};

const permissions = [
  ["document.read", "查看文件", "document"],
  ["document.upload", "上传文件", "document"],
  ["document.update_own", "维护本人文件", "document"],
  ["document.update_any", "维护全部文件", "document"],
  ["document.version", "上传文件版本", "document"],
  ["document.download", "下载文件", "document"],
  ["document.print", "打印文件", "document"],
  ["document.export", "批量导出文件", "document"],
  ["document.delete_own", "删除本人文件", "document"],
  ["document.delete_any", "删除全部文件", "document"],
  ["document.restore", "恢复文件", "document"],
  ["document.purge", "永久删除文件", "document"],
  ["matter.read", "查看项目与事项", "matter"],
  ["matter.create", "创建项目与事项", "matter"],
  ["matter.update_own", "维护本人项目与事项", "matter"],
  ["matter.update_any", "维护全部项目与事项", "matter"],
  ["matter.delete_own", "删除本人项目与事项", "matter"],
  ["matter.delete_any", "删除全部项目与事项", "matter"],
  ["matter.assign", "分配项目责任人", "matter"],
  ["matter.finance.manage", "维护事项借款与报销", "matter"],
  ["asset.read", "查看资产", "asset"],
  ["asset.submit", "提交待确认资产", "asset"],
  ["asset.create", "确认正式资产", "asset"],
  ["asset.update", "维护资产台账", "asset"],
  ["asset.import", "批量导入资产", "asset"],
  ["asset.export", "导出资产", "asset"],
  ["asset.borrow", "申请借用资产", "asset"],
  ["asset.return", "归还资产", "asset"],
  ["asset.reserve", "预约资产", "asset"],
  ["asset.transfer", "调拨资产", "asset"],
  ["asset.inventory", "执行资产盘点", "asset"],
  ["asset.maintenance", "维护维修保养", "asset"],
  ["asset.exit", "办理资产退出", "asset"],
  ["asset.approve", "审批资产业务", "asset"],
  ["finance_package.read", "查看财务归集", "finance_package"],
  ["finance_package.manage", "维护财务归集", "finance_package"],
  ["finance_package.export", "导出财务归集", "finance_package"],
  ["approval.read_own", "查看本人审批", "approval"],
  ["approval.review", "处理审批", "approval"],
  ["audit.read", "查看系统审计", "audit"],
  ["ai.use", "使用 AI 辅助", "ai"],
  ["ai.configure", "配置 AI 接口", "ai"],
  ["system.manage", "管理系统配置", "system"],
];

const employeePermissions = new Set([
  "document.read",
  "document.upload",
  "document.update_own",
  "document.version",
  "document.download",
  "document.print",
  "document.delete_own",
  "matter.read",
  "matter.create",
  "matter.update_own",
  "matter.delete_own",
  "matter.finance.manage",
  "asset.read",
  "asset.submit",
  "asset.borrow",
  "asset.return",
  "asset.reserve",
  "approval.read_own",
  "ai.use",
]);

async function seedRole(code, name, description) {
  return prisma.role.upsert({
    where: { code },
    update: { name, description, builtIn: true },
    create: { code, name, description, builtIn: true },
  });
}

async function main() {
  const organization = await prisma.organization.upsert({
    where: { code: DEFAULT_ORGANIZATION.code },
    update: { name: DEFAULT_ORGANIZATION.name, enabled: true, deletedAt: null },
    create: DEFAULT_ORGANIZATION,
  });

  const adminRole = await seedRole("ADMIN", "管理员", "管理当前企业全部业务数据与系统配置");
  const employeeRole = await seedRole("EMPLOYEE", "员工", "执行日常文件、事项和资产使用工作");
  const permissionByCode = new Map();

  for (const [code, name, module] of permissions) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: { name, module },
      create: { code, name, module },
    });
    permissionByCode.set(code, permission);
  }

  for (const permission of permissionByCode.values()) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: permission.id },
    });
  }

  for (const code of employeePermissions) {
    const permission = permissionByCode.get(code);
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: employeeRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: employeeRole.id, permissionId: permission.id },
    });
  }

  const users = await prisma.user.findMany({ where: { deletedAt: null } });
  for (const user of users) {
    const roleId = user.role === UserRole.ADMIN ? adminRole.id : employeeRole.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { organizationId: organization.id },
    });
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
      update: { isPrimary: true },
      create: { organizationId: organization.id, userId: user.id, isPrimary: true },
    });
    await prisma.userRoleBinding.upsert({
      where: {
        organizationId_userId_roleId: {
          organizationId: organization.id,
          userId: user.id,
          roleId,
        },
      },
      update: {},
      create: { organizationId: organization.id, userId: user.id, roleId },
    });
  }

  console.log(`Enterprise foundation seeded for ${users.length} user(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
