import { describe, expect, it } from "vitest";

import { calculateProjectProgress, calculateStageProgress } from "./progress-calculator";

const now = new Date("2026-09-10T00:00:00.000Z");

describe("project progress calculator", () => {
  it("uses task progress for a stage when the stage has tasks", () => {
    expect(calculateStageProgress(
      { id: "stage-1", status: "IN_PROGRESS", progress: 5, endDate: null },
      [
        { stageId: "stage-1", progress: 20, status: "IN_PROGRESS", dueDate: null },
        { stageId: "stage-1", progress: 80, status: "COMPLETED", dueDate: null },
      ],
    )).toBe(50);
  });

  it("calculates project progress from stages and reports delayed work", () => {
    const result = calculateProjectProgress({
      status: "IN_PROGRESS",
      endDate: new Date("2026-09-20T00:00:00.000Z"),
      stages: [
        { id: "stage-1", status: "IN_PROGRESS", progress: 0, endDate: null },
        { id: "stage-2", status: "PLANNED", progress: 0, endDate: null },
      ],
      milestones: [{ status: "PLANNED", dueDate: new Date("2026-09-09T00:00:00.000Z") }],
      tasks: [{ stageId: "stage-1", progress: 50, status: "IN_PROGRESS", dueDate: null }],
      now,
    });

    expect(result.progress).toBe(25);
    expect(result.health).toBe("DELAYED");
    expect(result.overdueMilestoneCount).toBe(1);
  });

  it("returns no plan for an active matter without scheduling data", () => {
    expect(calculateProjectProgress({
      status: "PLANNING",
      endDate: null,
      stages: [],
      milestones: [],
      tasks: [],
      now,
    }).health).toBe("NO_PLAN");
  });
});
