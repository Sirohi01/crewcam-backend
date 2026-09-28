import { Request, Response } from 'express';
import { CustomField } from '../models/CustomField';


export const createCustomField = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
    
    const customFieldData = {
      ...req.body,
      tenantId,
      companyId: tenantId
    };

    const newField = new CustomField(customFieldData);
    await newField.save();

    res.status(201).json({
      success: true,
      message: 'Custom field created successfully',
      data: newField
    });
  } catch (error: any) {
    console.error('Error creating custom field:', error);
    if (error.code === 11000) {
      res.status(400).json({
        success: false,
        message: 'A custom field with this API key already exists for this department',
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: 'Failed to create custom field',
      error: error.message
    });
  }
};

export const getCustomFieldsByDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { departmentId } = req.params;
    const tenantId = (req as any).tenantId || (req as any).user?.tenantId;

    const fields = await CustomField.find({
      departmentId: departmentId as string,
      tenantId
    }).sort({ fieldOrder: 1, createdAt: -1 });

    res.status(200).json({
      success: true,
      data: fields
    });
  } catch (error: any) {
    console.error('Error fetching custom fields:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch custom fields',
      error: error.message
    });
  }
};

export const deleteCustomField = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId || (req as any).user?.tenantId;

    const deletedField = await CustomField.findOneAndDelete({
      _id: id as string,
      tenantId
    });

    if (!deletedField) {
      res.status(404).json({ success: false, message: 'Custom field not found' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Custom field deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting custom field:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete custom field',
      error: error.message
    });
  }
};

export const getCustomFieldById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId || (req as any).user?.tenantId;

    const field = await CustomField.findOne({
      _id: id as string,
      tenantId
    });

    if (!field) {
      res.status(404).json({ success: false, message: 'Custom field not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: field
    });
  } catch (error: any) {
    console.error('Error fetching custom field:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch custom field',
      error: error.message
    });
  }
};

export const updateCustomField = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId || (req as any).user?.tenantId;

    const updatedField = await CustomField.findOneAndUpdate(
      { _id: id as string, tenantId },
      { $set: req.body },
      { returnDocument: 'after', runValidators: true }
    );

    if (!updatedField) {
      res.status(404).json({ success: false, message: 'Custom field not found' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Custom field updated successfully',
      data: updatedField
    });
  } catch (error: any) {
    console.error('Error updating custom field:', error);
    if (error.code === 11000) {
      res.status(400).json({
        success: false,
        message: 'A custom field with this API key already exists for this department',
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: 'Failed to update custom field',
      error: error.message
    });
  }
};
