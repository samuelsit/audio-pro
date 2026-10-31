import { preparerBaseJetable } from '@ha/db/admin';

import { urlBaseJetable } from './env';

export default async function setup(): Promise<void> {
  await preparerBaseJetable(urlBaseJetable('DATABASE_URL_TEST'));
}
