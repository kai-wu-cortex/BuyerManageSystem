import { handleQuotationUploadRequest } from '../../src/server/quotationFileApi.ts';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };
export default handleQuotationUploadRequest;
