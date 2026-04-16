export const maxDuration = 60;
import reportHandler from '../../../../api/report.js';
import { adaptHandler } from '../../../lib/adapt-handler';
export const GET = adaptHandler(reportHandler);
