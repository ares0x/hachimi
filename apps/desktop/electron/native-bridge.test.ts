import { describe, expect, it } from "vitest";
import {
  buildTrayMenuTemplate,
  computeDockBadgeCount,
  notificationPayloadForApproval,
  notificationPayloadForTask,
} from "./native-bridge.js";

describe("native-bridge (L1-D2/D10)", () => {
  it("builds a tray menu with works, tasks, approvals, and quit", () => {
    const template = buildTrayMenuTemplate({
      works: [
        { id: "w1", title: "分析项目结构" },
        { id: "w2", title: "写 README" },
      ],
      activeWorkId: "w1",
      runningTasks: 2,
      pendingApprovals: 1,
      daemonOnline: true,
    });
    const labels = template.map((i) => i.label ?? i.type).join("|");
    expect(labels).toContain("Works");
    expect(labels).toContain("后台任务: 2 运行中");
    expect(labels).toContain("待审批: 1");
    const worksSub = template.find((i) => i.type === "submenu")!;
    expect(worksSub.submenu).toHaveLength(2);
    expect(worksSub.submenu![0].click).toBe("focusWork:w1");
    expect(worksSub.submenu![0].checked).toBe(true);
    expect(template[template.length - 1].click).toBe("quit");
  });

  it("computes dock badge counts", () => {
    expect(computeDockBadgeCount({ pendingApprovals: 0, runningTasks: 0 })).toBeNull();
    expect(computeDockBadgeCount({ pendingApprovals: 2, runningTasks: 0 })).toBe(2);
    expect(computeDockBadgeCount({ pendingApprovals: 0, runningTasks: 3 })).toBe(3);
  });

  it("maps task events to notification copy", () => {
    expect(
      notificationPayloadForTask({ taskId: "t1", status: "completed", label: "npm test" }).title
    ).toBe("✅ 后台任务完成");
    const failed = notificationPayloadForTask({
      taskId: "t1",
      status: "failed",
      label: "build",
      exitCode: 2,
    });
    expect(failed.body).toContain("exit 2");
    expect(notificationPayloadForApproval("run_command").title).toContain("审批");
  });
});
