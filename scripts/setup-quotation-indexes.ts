import { getMongoDb } from '../src/lib/mongodb.ts';

async function main(): Promise<void> {
  const db = await getMongoDb();

  await Promise.all([
    db.collection('supplier_profiles').createIndex(
      { normalizedName: 1 },
      {
        name: 'supplier_normalized_name_unique',
        unique: true,
        partialFilterExpression: { deletedAt: null },
      },
    ),
    db.collection('supplier_quotations').createIndex(
      { supplierId: 1, quotationDate: -1, status: 1 },
      { name: 'quotation_supplier_date_status' },
    ),
    db.collection('supplier_quotation_items').createIndex(
      { quotationId: 1, lineNumber: 1 },
      { name: 'quotation_items_by_line' },
    ),
    db.collection('supplier_quotation_items').createIndex(
      { productGroupId: 1, normalizedTaxIncludedCnyPrice: 1 },
      { name: 'quotation_items_by_group_price' },
    ),
    db.collection('supplier_quote_parse_jobs').createIndex(
      { quotationId: 1, status: 1, createdAt: -1 },
      { name: 'parse_jobs_by_quotation' },
    ),
    db.collection('supplier_product_groups').createIndex(
      { standardName: 1, standardSpecification: 1, status: 1 },
      { name: 'product_groups_name_spec' },
    ),
    db.collection('supplier_quote_audit_logs').createIndex(
      { objectId: 1, createdAt: -1 },
      { name: 'quotation_audit_timeline' },
    ),
  ]);

  console.log('Supplier quotation indexes are ready.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
