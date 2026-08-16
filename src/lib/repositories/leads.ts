import type { Lead } from "../prospecting";
import { readStorage, writeStorage } from "./storage";

const STORAGE_KEY = "prospectai.leads.v1";

export class LeadRepository {
  private read(): Lead[] {
    return readStorage<Lead[]>(STORAGE_KEY, []);
  }

  private write(leads: Lead[]) {
    writeStorage(STORAGE_KEY, leads);
  }

  createMany(leads: Lead[]): Lead[] {
    const current = this.read();
    const ids = new Set(leads.map((lead) => lead.id));
    this.write([...current.filter((lead) => !ids.has(lead.id)), ...leads]);
    return leads;
  }

  list(): Lead[] {
    return this.read();
  }

  listByCampaign(campaignId: string): Lead[] {
    return this.read().filter((lead) => lead.campaignId === campaignId);
  }

  get(id: string): Lead | undefined {
    return this.read().find((lead) => lead.id === id);
  }

  update(id: string, patch: Partial<Lead>): Lead | undefined {
    const leads = this.read();
    let updated: Lead | undefined;
    const next = leads.map((lead) => {
      if (lead.id !== id) return lead;
      updated = { ...lead, ...patch };
      return updated;
    });
    if (updated) this.write(next);
    return updated;
  }
}

export const leadRepository = new LeadRepository();
