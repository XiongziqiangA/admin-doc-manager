export type ProgressMatterStatus = "PLANNING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type ProgressStageStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type ProgressMilestoneStatus = "PLANNED" | "COMPLETED" | "CANCELLED";
export type ProjectHealth = "HEALTHY" | "AT_RISK" | "DELAYED" | "COMPLETED" | "CANCELLED" | "NO_PLAN";

export interface ProgressTaskInput {
  stageId: string | null;
  progress: number;
  status: "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  dueDate: Date | null;
}

export interface ProgressStageInput {
  id: string;
  status: ProgressStageStatus;
  progress: number;
  endDate: Date | null;
}

export interface ProgressMilestoneInput {
  status: ProgressMilestoneStatus;
  dueDate: Date | null;
}

export interface ProjectProgressSummary {
  progress: number;
  health: ProjectHealth;
  delayed: boolean;
  stageCount: number;
  completedStageCount: number;
  milestoneCount: number;
  completedMilestoneCount: number;
  overdueTaskCount: number;
  overdueMilestoneCount: number;
}

const ACTIVE_TASK_STATUSES = new Set(["TODO", "IN_PROGRESS"]);

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function isBefore(value: Date | null, now: Date) {
  return Boolean(value && value.getTime() < now.getTime());
}

function isWithinNextDays(value: Date | null, now: Date, days: number) {
  if (!value) return false;
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return value.getTime() >= now.getTime() && value.getTime() <= end.getTime();
}

export function calculateProjectProgress(input: {
  status: ProgressMatterStatus;
  endDate: Date | null;
  stages: ProgressStageInput[];
  milestones: ProgressMilestoneInput[];
  tasks: ProgressTaskInput[];
  now?: Date;
}): ProjectProgressSummary {
  const now = input.now ?? new Date();
  const activeTasks = input.tasks.filter((task) => ACTIVE_TASK_STATUSES.has(task.status));
  const overdueTaskCount = activeTasks.filter((task) => isBefore(task.dueDate, now)).length;
  const activeMilestones = input.milestones.filter((milestone) => milestone.status === "PLANNED");
  const overdueMilestoneCount = activeMilestones.filter((milestone) => isBefore(milestone.dueDate, now)).length;
  const stageProgress = input.stages.map((stage) => {
    const tasks = input.tasks.filter((task) => task.stageId === stage.id);
    return tasks.length ? average(tasks.map((task) => Math.max(0, Math.min(100, task.progress)))) : Math.max(0, Math.min(100, stage.progress));
  });
  const progress = input.status === "COMPLETED"
    ? 100
    : input.stages.length
      ? average(stageProgress)
      : input.tasks.length
        ? average(input.tasks.map((task) => Math.max(0, Math.min(100, task.progress))))
        : 0;
  const completedStageCount = input.stages.filter((stage) => stage.status === "COMPLETED").length;
  const completedMilestoneCount = input.milestones.filter((milestone) => milestone.status === "COMPLETED").length;

  let health: ProjectHealth;
  if (input.status === "COMPLETED") {
    health = "COMPLETED";
  } else if (input.status === "CANCELLED") {
    health = "CANCELLED";
  } else if (!input.stages.length && !input.tasks.length && !input.endDate && !input.milestones.length) {
    health = "NO_PLAN";
  } else if (overdueTaskCount > 0 || overdueMilestoneCount > 0 || isBefore(input.endDate, now)) {
    health = "DELAYED";
  } else if (
    isWithinNextDays(input.endDate, now, 7)
    || input.milestones.some((milestone) => milestone.status === "PLANNED" && isWithinNextDays(milestone.dueDate, now, 7))
    || activeTasks.some((task) => isWithinNextDays(task.dueDate, now, 7))
  ) {
    health = "AT_RISK";
  } else {
    health = "HEALTHY";
  }

  return {
    progress,
    health,
    delayed: health === "DELAYED",
    stageCount: input.stages.length,
    completedStageCount,
    milestoneCount: input.milestones.length,
    completedMilestoneCount,
    overdueTaskCount,
    overdueMilestoneCount,
  };
}

export function calculateStageProgress(stage: ProgressStageInput, tasks: ProgressTaskInput[]) {
  const stageTasks = tasks.filter((task) => task.stageId === stage.id);
  return stageTasks.length
    ? average(stageTasks.map((task) => Math.max(0, Math.min(100, task.progress))))
    : Math.max(0, Math.min(100, stage.progress));
}
