import type { Meeting } from "../prospecting";
import { readStorage, writeStorage } from "./storage";

const STORAGE_KEY = "prospectai.meetings.v1";

export class MeetingRepository {
  private read(): Meeting[] {
    return readStorage<Meeting[]>(STORAGE_KEY, []);
  }

  private write(meetings: Meeting[]) {
    writeStorage(STORAGE_KEY, meetings);
  }

  create(meeting: Meeting): Meeting {
    const current = this.read();
    this.write([...current, meeting]);
    return meeting;
  }

  list(): Meeting[] {
    return this.read();
  }

  listByCampaign(campaignId: string): Meeting[] {
    return this.read().filter((meeting) => meeting.campaignId === campaignId);
  }

  listByLead(leadId: string): Meeting[] {
    return this.read().filter((meeting) => meeting.leadId === leadId);
  }

  get(id: string): Meeting | undefined {
    return this.read().find((meeting) => meeting.id === id);
  }

  update(id: string, patch: Partial<Meeting>): Meeting | undefined {
    const meetings = this.read();
    let updated: Meeting | undefined;
    const next = meetings.map((meeting) => {
      if (meeting.id !== id) return meeting;
      updated = { ...meeting, ...patch };
      return updated;
    });
    if (updated) this.write(next);
    return updated;
  }
}

export const meetingRepository = new MeetingRepository();
