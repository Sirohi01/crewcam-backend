import { Request, Response, NextFunction } from 'express';
import History from '../models/History';
import SubDepartment from '../models/SubDepartment';

// ======================================================
// GET HISTORY
// GET /api/v1/sub-departments/:code/history
// ======================================================

export const getHistory = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { code } = req.params;

        const {
            activity,
            user,
            group,
            startDate,
            endDate,
            page = '1',
            limit = '6',
        } = req.query;

        // ------------------------------------------
        // Find Sub Department
        // ------------------------------------------

        const subDepartment =
            await SubDepartment.findOne({
                code,
            }).lean();

        if (!subDepartment) {
            return res.status(404).json({
                success: false,
                message: 'Sub department not found',
            });
        }


        // ------------------------------------------
        // Build Filter
        // ------------------------------------------

        const filter: any = {
            subDepartment: subDepartment._id,
        };


        // Activity filter

        if (
            activity &&
            activity !== 'All Activity Types'
        ) {
            filter.activity = activity;
        }


        // User filter

        if (
            user &&
            user !== 'All Users'
        ) {
            filter['performedBy.name'] = user;
        }

        // Activity group filter

        if (group) {
            filter.activityGroup = group;
        }

        // Date filter

        if (startDate || endDate) {
            filter.dateTime = {};

            if (startDate) {
                const start =
                    new Date(startDate as string);

                start.setHours(
                    0,
                    0,
                    0,
                    0
                );

                filter.dateTime.$gte = start;
            }

            if (endDate) {
                const end =
                    new Date(endDate as string);

                end.setHours(
                    23,
                    59,
                    59,
                    999
                );

                filter.dateTime.$lte = end;
            }
        }

        // ------------------------------------------
        // Pagination
        // ------------------------------------------

        const currentPage =
            Math.max(
                Number(page) || 1,
                1
            );

        const pageLimit =
            Math.max(
                Number(limit) || 6,
                1
            );

        const skip =
            (currentPage - 1) *
            pageLimit;

        // ------------------------------------------
        // Fetch data
        // ------------------------------------------

        const [
            activities,
            total,
        ] = await Promise.all([
            History.find(filter)
                .sort({
                    dateTime: -1,
                })
                .skip(skip)
                .limit(pageLimit)
                .lean(),

            History.countDocuments(filter),
        ]);

        // ------------------------------------------
        // Response
        // ------------------------------------------

        return res.status(200).json({
            success: true,

            subDepartment: {
                _id: subDepartment._id,

                name:
                    subDepartment.name,

                code:
                    subDepartment.code,

                department:
                    subDepartment.department,

                parentDepartment:
                    subDepartment.parentDepartment,

                createdBy:
                    subDepartment.createdBy,

                createdOn:
                    subDepartment.createdAt,

                lastUpdated:
                    subDepartment.updatedAt,

                totalChanges:
                    total,
            },

            data: activities,

            pagination: {
                page: currentPage,

                limit: pageLimit,

                total,

                totalPages:
                    Math.ceil(
                        total / pageLimit
                    ),
            },
        });

    } catch (error) {
        next(error);
    }
};

// ======================================================
// GET ACTIVITY SUMMARY
// GET /api/v1/sub-departments/:code/history/summary
// ======================================================

export const getActivitySummary = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { code } = req.params;

        const subDepartment =
            await SubDepartment.findOne({
                code,
            });

        if (!subDepartment) {
            return res.status(404).json({
                success: false,
                message: 'Sub department not found',
            });
        }

        const summary =
            await History.aggregate([
                {
                    $match: {
                        subDepartment:
                            subDepartment._id,
                    },
                },

                {
                    $group: {
                        _id: '$activity',

                        count: {
                            $sum: 1,
                        },
                    },
                },

                {
                    $sort: {
                        count: -1,
                    },
                },
            ]);

        const total =
            summary.reduce(
                (sum, item) =>
                    sum + item.count,
                0
            );

        const data =
            summary.map((item) => ({
                name: item._id,

                value: item.count,

                percentage:
                    total > 0
                        ? Number(
                            (
                                (item.count /
                                    total) *
                                100
                            ).toFixed(2)
                        )
                        : 0,
            }));

        return res.status(200).json({
            success: true,

            total,

            data,
        });

    } catch (error) {
        next(error);
    }
};

// ======================================================
// GET ACTIVITY GROUP SUMMARY
// GET /api/v1/sub-departments/:code/history/activity-groups
// ======================================================

export const getActivityGroups = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { code } = req.params;

        const subDepartment =
            await SubDepartment.findOne({
                code,
            });

        if (!subDepartment) {
            return res.status(404).json({
                success: false,
                message: 'Sub department not found',
            });
        }

        const groups =
            await History.aggregate([
                {
                    $match: {
                        subDepartment:
                            subDepartment._id,
                    },
                },

                {
                    $group: {
                        _id: '$activityGroup',

                        count: {
                            $sum: 1,
                        },
                    },
                },

                {
                    $sort: {
                        count: -1,
                    },
                },
            ]);

        return res.status(200).json({
            success: true,

            data: groups.map((item) => ({
                label: item._id,

                count: item.count,
            })),
        });

    } catch (error) {
        next(error);
    }
};

// ======================================================
// CREATE HISTORY
// POST /api/v1/sub-departments/:code/history
// ======================================================

export const createHistory = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { code } = req.params;

        const subDepartment =
            await SubDepartment.findOne({
                code,
            });

        if (!subDepartment) {
            return res.status(404).json({
                success: false,
                message: 'Sub department not found',
            });
        }


        // Get IP automatically

        const ip =
            req.ip ||
            req.headers['x-forwarded-for']?.toString() ||
            '';


        const history =
            await History.create({
                subDepartment:
                    subDepartment._id,

                dateTime:
                    req.body.dateTime ||
                    new Date(),

                activity:
                    req.body.activity,

                activityGroup:
                    req.body.activityGroup,

                title:
                    req.body.title,

                detail:
                    req.body.detail || '',

                performedBy:
                    req.body.performedBy,

                ip,
            });


        return res.status(201).json({
            success: true,

            message:
                'History created successfully',

            data: history,
        });

    } catch (error) {
        next(error);
    }
};