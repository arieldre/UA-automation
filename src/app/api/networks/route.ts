export const maxDuration = 60;
import networksHandler from '../../../../api/networks.js';
import { adaptHandler } from '../../../lib/adapt-handler';
export const GET = adaptHandler(networksHandler);
