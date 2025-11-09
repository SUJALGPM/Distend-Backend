const express = require('express');
const Allocation = require('../models/Allocation');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get teacher's allocations
router.get('/allocations', authMiddleware, requireRole(['teacher']), async (req, res) => {
  try {
    const teacherId = req.user.userId;

    const allocations = await Allocation.find({ teacherId })
      .populate('subjectId', 'name code')
      .populate('students', 'name studentId email');

    res.json(allocations);
  } catch (error) {
    console.error('Get allocations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get attendance reports for teacher's subjects
router.get('/attendance-reports', authMiddleware, requireRole(['teacher']), async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { subjectId, startDate, endDate } = req.query;

    const filter = { recordedBy: teacherId };
    if (subjectId) filter.subjectId = subjectId;
    if (startDate && endDate) {
      // Add date range filter logic here
    }

    const attendance = await Attendance.find(filter)
      .populate('studentId', 'name studentId email')
      .populate('subjectId', 'name code')
      .sort({ createdAtDate: -1, createdAtTime: -1 });

    // Group by subject
    const subjectReports = {};
    
    attendance.forEach(record => {
      const subjectId = record.subjectId._id.toString();
      if (!subjectReports[subjectId]) {
        subjectReports[subjectId] = {
          subject: record.subjectId,
          records: [],
          stats: {
            total: 0,
            present: 0,
            absent: 0,
            late: 0,
            excused: 0
          }
        };
      }

      subjectReports[subjectId].records.push(record);
      subjectReports[subjectId].stats.total++;
      subjectReports[subjectId].stats[record.status.toLowerCase()]++;
    });

    res.json(Object.values(subjectReports));
  } catch (error) {
    console.error('Get attendance reports error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get students for a specific allocation
router.get('/allocations/:allocationId/students', authMiddleware, requireRole(['teacher']), async (req, res) => {
  try {
    const { allocationId } = req.params;
    const teacherId = req.user.userId;

    const allocation = await Allocation.findOne({ 
      _id: allocationId, 
      teacherId 
    }).populate('students', 'name studentId email division batch');

    if (!allocation) {
      return res.status(404).json({ message: 'Allocation not found' });
    }

    res.json(allocation.students);
  } catch (error) {
    console.error('Get allocation students error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;