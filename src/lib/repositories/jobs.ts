import type { ProspectingJob } from "../pipeline";
import { readStorage, writeStorage } from "./storage";

const STORAGE_KEY = "prospectai.jobs.v1";

export class JobRepository {
  private read(): ProspectingJob[] {
    return readStorage<ProspectingJob[]>(STORAGE_KEY, []);
  }

  private write(jobs: ProspectingJob[]) {
    writeStorage(STORAGE_KEY, jobs);
  }

  createMany(jobs: ProspectingJob[]): ProspectingJob[] {
    const current = this.read();
    const ids = new Set(jobs.map((job) => job.id));
    this.write([...current.filter((job) => !ids.has(job.id)), ...jobs]);
    return jobs;
  }

  list(): ProspectingJob[] {
    return this.read();
  }

  listByCampaign(campaignId: string): ProspectingJob[] {
    return this.read().filter((job) => job.campaignId === campaignId);
  }

  get(id: string): ProspectingJob | undefined {
    return this.read().find((job) => job.id === id);
  }

  update(id: string, patch: Partial<ProspectingJob>): ProspectingJob | undefined {
    const jobs = this.read();
    let updated: ProspectingJob | undefined;
    const next = jobs.map((job) => {
      if (job.id !== id) return job;
      updated = { ...job, ...patch };
      return updated;
    });
    if (updated) this.write(next);
    return updated;
  }
}

export const jobRepository = new JobRepository();
