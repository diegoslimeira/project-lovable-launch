import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import type { Meeting, MeetingProvider, MeetingStatus, MeetingSyncStatus } from "../prospecting";
import { getCurrentWorkspaceId, getDb } from "../db/client";
import { meetings } from "../db/schema";

type Row = typeof meetings.$inferSelect;

function rowToMeeting(row: Row): Meeting {
  return {
    id: row.id,
    leadId: row.leadId,
    campaignId: row.campaignId,
    scheduledAt: row.scheduledAt,
    durationMinutes: row.durationMinutes,
    responsibleName: row.responsibleName ?? undefined,
    title: row.title,
    notes: row.notes ?? undefined,
    status: row.status as MeetingStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt ?? undefined,
    outcome: row.outcome ?? undefined,
    resultNotes: row.resultNotes ?? undefined,
    provider: row.provider as MeetingProvider,
    externalCalendarEventId: row.externalCalendarEventId ?? undefined,
    meetingUrl: row.meetingUrl ?? undefined,
    syncStatus: (row.syncStatus as MeetingSyncStatus | null) ?? undefined,
  } as Meeting;
}

const createMeetingFn = createServerFn({ method: "POST" })
  .validator((meeting: Meeting) => meeting)
  .handler(async ({ data: meeting }) => {
    const db = getDb();
    const workspaceId = getCurrentWorkspaceId();
    await db.insert(meetings).values({ ...meeting, workspaceId });
    return meeting;
  });

const listMeetingsFn = createServerFn({ method: "GET" }).handler(async () => {
  const db = getDb();
  const workspaceId = getCurrentWorkspaceId();
  const rows = await db.select().from(meetings).where(eq(meetings.workspaceId, workspaceId));
  return rows.map(rowToMeeting);
});

const listMeetingsByCampaignFn = createServerFn({ method: "GET" })
  .validator((campaignId: string) => campaignId)
  .handler(async ({ data: campaignId }) => {
    const db = getDb();
    const workspaceId = getCurrentWorkspaceId();
    const rows = await db
      .select()
      .from(meetings)
      .where(and(eq(meetings.campaignId, campaignId), eq(meetings.workspaceId, workspaceId)));
    return rows.map(rowToMeeting);
  });

const listMeetingsByLeadFn = createServerFn({ method: "GET" })
  .validator((leadId: string) => leadId)
  .handler(async ({ data: leadId }) => {
    const db = getDb();
    const workspaceId = getCurrentWorkspaceId();
    const rows = await db
      .select()
      .from(meetings)
      .where(and(eq(meetings.leadId, leadId), eq(meetings.workspaceId, workspaceId)));
    return rows.map(rowToMeeting);
  });

const getMeetingFn = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const db = getDb();
    const rows = await db.select().from(meetings).where(eq(meetings.id, id));
    return rows[0] ? rowToMeeting(rows[0]) : undefined;
  });

const updateMeetingFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; patch: Partial<Meeting> }) => input)
  .handler(async ({ data: { id, patch } }) => {
    const db = getDb();
    await db.update(meetings).set(patch).where(eq(meetings.id, id));
    const rows = await db.select().from(meetings).where(eq(meetings.id, id));
    return rows[0] ? rowToMeeting(rows[0]) : undefined;
  });

export const meetingRepository = {
  create: (meeting: Meeting): Promise<Meeting> => createMeetingFn({ data: meeting }),
  list: (): Promise<Meeting[]> => listMeetingsFn(),
  listByCampaign: (campaignId: string): Promise<Meeting[]> =>
    listMeetingsByCampaignFn({ data: campaignId }),
  listByLead: (leadId: string): Promise<Meeting[]> => listMeetingsByLeadFn({ data: leadId }),
  get: (id: string): Promise<Meeting | undefined> => getMeetingFn({ data: id }),
  update: (id: string, patch: Partial<Meeting>): Promise<Meeting | undefined> =>
    updateMeetingFn({ data: { id, patch } }),
};
