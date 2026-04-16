export const maxDuration = 60;
import refreshHandler from '../../../../../api/cron/refresh.js';
import { adaptHandler } from '../../../../lib/adapt-handler';
export const GET = adaptHandler(refreshHandler);
