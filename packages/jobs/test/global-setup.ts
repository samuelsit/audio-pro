import { preparerBaseJetable } from '@ha/db/admin';

import { urlBaseJobs } from './env';

export default async function setup(): Promise<void> {
  await preparerBaseJetable(urlBaseJobs());
}
