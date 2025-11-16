const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const Allocation = require('../models/Allocation');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Mark attendance (single or bulk) with parallel processing
router.post('/mark', authMiddleware, async (req, res) => {
  try {
    const { attendanceRecords } = req.body;
    const teacherId = req.user.userId;
    const startTime = Date.now();
    
    // Get Lamport Clock timestamp
    const lamportTime = req.io.lamportClock ? req.io.lamportClock.tick() : 0;
    
    console.log(`\n⏰ Lamport Clock - Attendance Marking`);
    console.log(`   Records: ${attendanceRecords.length}`);
    console.log(`   Lamport Time: ${lamportTime}`);
    console.log(`   Node: ${process.env.NODE_ID || 'node-1'}\n`);

    // Use worker thread for bulk processing if more than 10 records
    if (attendanceRecords.length > 10) {
      const attendanceProcessor = require('../workers/attendanceProcessor');
      
      const result = await attendanceProcessor.processBulkAttendance(
        attendanceRecords,
        { teacherId, startTime }
      );

      if (!result.success) {
        return res.status(500).json({
          message: 'Error processing bulk attendance',
          error: result.error,
          details: result.errorDetails
        });
      }

      // Emit real-time update with Lamport timestamp
      await req.io.emitToRole('admin', 'attendance-updated', {
        records: result.results,
        teacherId,
        processingTime: Date.now() - startTime,
        recordsCreated: result.recordsCreated,
        nodeId: process.env.NODE_ID || 'node-1'
      });

      // Check for defaulters in background
      setImmediate(async () => {
        try {
          const defaulters = await checkDefaulters(75);
          if (defaulters.length > 0) {
            await req.io.emitToRole('admin', 'defaulter-alert', {
              defaulters,
              threshold: 75,
              triggeredBy: teacherId
            });
          }
        } catch (error) {
          console.error('Error checking defaulters:', error);
        }
      });

      res.json({
        message: 'Bulk attendance processed successfully',
        recordsCreated: result.recordsCreated,
        errors: result.errors,
        processingTime: Date.now() - startTime,
        processedInWorker: true
      });

    } else {
      // Process small batches in main thread
      const createdRecords = [];

      for (const record of attendanceRecords) {
        const attendance = new Attendance({
          ...record,
          recordedBy: teacherId
        });
        
        const savedRecord = await attendance.save();
        
        // Update student's attendance record
        await Student.findByIdAndUpdate(
          record.studentId,
          { $push: { attedanceRecord: savedRecord._id } }
        );

        createdRecords.push(savedRecord);
      }

      // Emit real-time update
      await req.io.emitToRole('admin', 'attendance-updated', {
        records: createdRecords,
        teacherId,
        processingTime: Date.now() - startTime
      });

      // Check for defaulters
      const defaulters = await checkDefaulters(75);
      if (defaulters.length > 0) {
        await req.io.emitToRole('admin', 'defaulter-alert', {
          defaulters,
          threshold: 75,
          triggeredBy: teacherId
        });
      }

      res.json({
        message: 'Attendance marked successfully',
        records: createdRecords,
        processingTime: Date.now() - startTime
      });
    }

  } catch (error) {
    console.error('Mark attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload CSV attendance with parallel processing
router.post('/upload-csv', authMiddleware, upload.single('csvFile'), async (req, res) => {
  try {
    const { subjectId, type } = req.body;
    const teacherId = req.user.userId;
    const startTime = Date.now();
    const results = [];

    // Read CSV file
    const csvStream = fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          // Get Lamport Clock from Socket.IO instance
          const lamportTime = req.io.lamportClock ? req.io.lamportClock.tick() : 0;
          
          console.log(`\n${'='.repeat(60)}`);
          console.log(`📤 CSV Upload Started on ${process.env.NODE_ID || 'node-1'}`);
          console.log(`   File: ${req.file.originalname}`);
          console.log(`   Records: ${results.length}`);
          console.log(`   Subject: ${subjectId}`);
          console.log(`   ⏰ Lamport Time: ${lamportTime}`);
          console.log(`${'='.repeat(60)}`);
          
          // Use worker thread for CSV processing
          const attendanceProcessor = require('../workers/attendanceProcessor');
          
          const result = await attendanceProcessor.processAttendanceCSV(
            results,
            { subjectId, type, teacherId, startTime }
          );
          
          const completeLamportTime = req.io.lamportClock ? req.io.lamportClock.tick() : 0;
          
          console.log(`${'='.repeat(60)}`);
          console.log(`✅ CSV Processing Complete`);
          console.log(`   Processed: ${result.recordsProcessed} records`);
          console.log(`   Errors: ${result.errors}`);
          console.log(`   Parallel Chunks: ${result.parallelChunks || 'N/A'}`);
          console.log(`   Total Time: ${Date.now() - startTime}ms`);
          console.log(`   ⏰ Lamport Time: ${completeLamportTime}`);
          console.log(`${'='.repeat(60)}\n`);

          // Clean up uploaded file
          fs.unlinkSync(req.file.path);

          if (!result.success) {
            return res.status(500).json({
              message: 'Error processing CSV',
              error: result.error,
              errorDetails: result.errorDetails
            });
          }

          // Emit real-time update to all connected clients
          await req.io.emitToRole('admin', 'csv-upload-completed', {
            fileName: req.file.originalname,
            recordsProcessed: result.recordsProcessed,
            errors: result.errors,
            teacherId,
            subjectId,
            processingTime: Date.now() - startTime,
            nodeId: process.env.NODE_ID || 'node-1'
          });

          // Emit to teacher's connected clients
          await req.io.emitToUser(teacherId, 'attendance-csv-processed', {
            fileName: req.file.originalname,
            recordsProcessed: result.recordsProcessed,
            errors: result.errors,
            processingTime: Date.now() - startTime
          });

          // Check for defaulters in background
          setImmediate(async () => {
            try {
              const defaulters = await checkDefaulters(75);
              if (defaulters.length > 0) {
                await req.io.emitToRole('admin', 'defaulter-alert', {
                  defaulters,
                  threshold: 75,
                  triggeredBy: teacherId,
                  source: 'csv-upload'
                });
              }
            } catch (error) {
              console.error('Error checking defaulters after CSV upload:', error);
            }
          });

          res.json({
            message: 'CSV processed successfully',
            recordsProcessed: result.recordsProcessed,
            errors: result.errors,
            errorDetails: result.errorDetails,
            processingTime: Date.now() - startTime,
            processedInWorker: true
          });

        } catch (error) {
          console.error('CSV processing error:', error);
          
          // Clean up file on error
          try {
            fs.unlinkSync(req.file.path);
          } catch (unlinkError) {
            console.error('Error cleaning up file:', unlinkError);
          }
          
          res.status(500).json({ 
            message: 'Error processing CSV',
            error: error.message 
          });
        }
      })
      .on('error', (error) => {
        console.error('CSV reading error:', error);
        
        // Clean up file on error
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error('Error cleaning up file:', unlinkError);
        }
        
        res.status(500).json({ 
          message: 'Error reading CSV file',
          error: error.message 
        });
      });

  } catch (error) {
    console.error('CSV upload error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get attendance for student
router.get('/student/:studentId', authMiddleware, async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const attendance = await Attendance.find({ studentId })
      .populate('subjectId', 'name code')
      .populate('recordedBy', 'teacherName')
      .sort({ createdAtDate: -1, createdAtTime: -1 });

    // Calculate attendance percentage by subject
    const subjectStats = {};
    
    attendance.forEach(record => {
      const subjectId = record.subjectId._id.toString();
      if (!subjectStats[subjectId]) {
        subjectStats[subjectId] = {
          subject: record.subjectId,
          total: 0,
          present: 0,
          percentage: 0
        };
      }
      
      subjectStats[subjectId].total++;
      if (record.status === 'Present' || record.status === 'Late') {
        subjectStats[subjectId].present++;
      }
    });

    // Calculate percentages
    Object.keys(subjectStats).forEach(subjectId => {
      const stats = subjectStats[subjectId];
      stats.percentage = stats.total > 0 ? (stats.present / stats.total) * 100 : 0;
    });

    res.json({
      attendance,
      subjectStats: Object.values(subjectStats)
    });

  } catch (error) {
    console.error('Get student attendance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get defaulters
router.get('/defaulters', authMiddleware, async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 75;
    const defaulters = await checkDefaulters(threshold);
    
    res.json(defaulters);
  } catch (error) {
    console.error('Get defaulters error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to check defaulters
async function checkDefaulters(threshold) {
  try {
    const students = await Student.find().populate('attedanceRecord');
    const defaulters = [];

    for (const student of students) {
      const attendance = await Attendance.find({ studentId: student._id })
        .populate('subjectId', 'name code');

      const subjectStats = {};
      
      attendance.forEach(record => {
        const subjectId = record.subjectId._id.toString();
        if (!subjectStats[subjectId]) {
          subjectStats[subjectId] = {
            subject: record.subjectId,
            total: 0,
            present: 0
          };
        }
        
        subjectStats[subjectId].total++;
        if (record.status === 'Present' || record.status === 'Late') {
          subjectStats[subjectId].present++;
        }
      });

      const defaulterSubjects = [];
      Object.values(subjectStats).forEach(stats => {
        const percentage = stats.total > 0 ? (stats.present / stats.total) * 100 : 0;
        if (percentage < threshold) {
          defaulterSubjects.push({
            ...stats,
            percentage
          });
        }
      });

      if (defaulterSubjects.length > 0) {
        defaulters.push({
          student: {
            _id: student._id,
            name: student.name,
            studentId: student.studentId,
            email: student.email
          },
          defaulterSubjects
        });
      }
    }

    return defaulters;
  } catch (error) {
    console.error('Check defaulters error:', error);
    return [];
  }
}

module.exports = router;