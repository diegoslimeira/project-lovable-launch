import type { Campaign } from "../prospecting";
import { readStorage, writeStorage } from "./storage";

const STORAGE_KEY = "prospectai.campaigns.v1";

export class CampaignRepository {
  private read(): Campaign[] {
    return readStorage<Campaign[]>(STORAGE_KEY, []);
  }

  private write(campaigns: Campaign[]) {
    writeStorage(STORAGE_KEY, campaigns);
  }

  create(campaign: Campaign): Campaign {
    const campaigns = this.read();
    this.write([...campaigns, campaign]);
    return campaign;
  }

  list(): Campaign[] {
    return this.read();
  }

  get(id: string): Campaign | undefined {
    return this.read().find((campaign) => campaign.id === id);
  }

  update(id: string, patch: Partial<Campaign>): Campaign | undefined {
    const campaigns = this.read();
    let updated: Campaign | undefined;
    const next = campaigns.map((campaign) => {
      if (campaign.id !== id) return campaign;
      updated = { ...campaign, ...patch };
      return updated;
    });
    if (updated) this.write(next);
    return updated;
  }
}

export const campaignRepository = new CampaignRepository();
