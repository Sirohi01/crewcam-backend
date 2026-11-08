import { Schema, Document } from 'mongoose';
import mongoose from 'mongoose';

export interface ITenantScoped extends Document {
  tenantId: string;
  companyId?: string;
  branchId?: string | mongoose.Types.ObjectId;
  departmentId?: string | mongoose.Types.ObjectId;
}

export const tenantPlugin = (schema: Schema) => {
  const scopeFields: Record<string, any> = {};
  if (!schema.path('tenantId')) scopeFields.tenantId = { type: String, required: true, index: true };
  if (!schema.path('companyId')) scopeFields.companyId = { type: String, index: true };
  if (!schema.path('branchId')) scopeFields.branchId = { type: String, index: true };
  if (!schema.path('departmentId')) scopeFields.departmentId = { type: String, index: true };
  schema.add(scopeFields);
  const enforceTenantId = function (this: any) {
    const filter = this.getFilter();
    const options = this.getOptions();

    if (options?.bypassTenantIsolation) {
      return;
    }

    if (!filter || filter.tenantId === undefined) {
      const idFilter = filter?._id;
      const isPopulateStyleIdIn = idFilter && typeof idFilter === 'object' && Array.isArray(idFilter.$in);
      if (isPopulateStyleIdIn) {
        return;
      }
      throw new Error(`Tenant isolation violation: tenantId is required in query filter for ${this.model?.modelName || 'scoped model'}. Use { bypassTenantIsolation: true } in query options if this is intentional.`);
    }
  };

  schema.pre('find' as any, enforceTenantId);
  schema.pre('findOne' as any, enforceTenantId);
  schema.pre('findOneAndUpdate' as any, enforceTenantId);
  schema.pre('findOneAndDelete' as any, enforceTenantId);
  schema.pre('updateOne' as any, enforceTenantId);
  schema.pre('updateMany' as any, enforceTenantId);
  schema.pre('deleteMany' as any, enforceTenantId);
  schema.pre('deleteOne' as any, enforceTenantId);
  schema.pre('countDocuments' as any, enforceTenantId);

  // Controllers often forward req.body into an update; a body carrying `tenantId` would
  // otherwise re-home the record into another company. Upserts still get the right
  // tenantId, because MongoDB copies equality fields from the (tenant-scoped) filter.
  const stripTenantReassignment = function (this: any) {
    if (this.getOptions()?.bypassTenantIsolation) return;
    const update = this.getUpdate();
    if (!update || Array.isArray(update)) return;
    delete update.tenantId;
    for (const operator of ['$set', '$unset', '$rename']) {
      if (update[operator]) delete update[operator].tenantId;
    }
  };

  schema.pre('findOneAndUpdate' as any, stripTenantReassignment);
  schema.pre('updateOne' as any, stripTenantReassignment);
  schema.pre('updateMany' as any, stripTenantReassignment);

  // Aggregations bypass query middleware, so they need their own guard: the pipeline
  // must open with a $match that constrains tenantId, otherwise one tenant's report or
  // dashboard could read every tenant's rows.
  schema.pre('aggregate', function (this: any) {
    if (this.options?.bypassTenantIsolation) {
      delete this.options.bypassTenantIsolation;
      return;
    }
    const firstStage = this.pipeline()[0];
    if (!firstStage?.$match || firstStage.$match.tenantId === undefined) {
      throw new Error(`Tenant isolation violation: aggregate on ${this._model?.modelName || 'scoped model'} must start with a $match on tenantId. Use .option({ bypassTenantIsolation: true }) if this is intentional.`);
    }
  });
};
