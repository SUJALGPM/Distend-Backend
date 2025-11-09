const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const Allocation = require('../models/Allocation');
const { authMiddleware } = require('../middleware/auth');
const Admin = require("../models/Admin");
const Semester = require("../models/Semester");
const Department = require("../models/Department");

const router = express.Router();

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Mark attendance (single or bulk) with parallel processing
router.post('/mark', authMiddleware, async (req, res) => {
  try {
    const { attendanceRecords } = req.body;
    const teacherId = req.user.userId;
    const startTime = Date.now();

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
// router.post('/upload-csv', authMiddleware, upload.single('csvFile'), async (req, res) => {
//   try {
//     const { subjectId, type } = req.body;
//     const teacherId = req.user.userId;
//     const startTime = Date.now();
//     const results = [];

//     // Read CSV file
//     const csvStream = fs.createReadStream(req.file.path)
//       .pipe(csv())
//       .on('data', (data) => results.push(data))
//       .on('end', async () => {
//         try {
//           console.log(`Processing CSV with ${results.length} records using worker thread`);
          
//           // Use worker thread for CSV processing
//           const attendanceProcessor = require('../workers/attendanceProcessor');
          
//           const result = await attendanceProcessor.processAttendanceCSV(
//             results,
//             { subjectId, type, teacherId, startTime }
//           );

//           // Clean up uploaded file
//           fs.unlinkSync(req.file.path);

//           if (!result.success) {
//             return res.status(500).json({
//               message: 'Error processing CSV',
//               error: result.error,
//               errorDetails: result.errorDetails
//             });
//           }

//           // Emit real-time update to all connected clients
//           await req.io.emitToRole('admin', 'csv-upload-completed', {
//             fileName: req.file.originalname,
//             recordsProcessed: result.recordsProcessed,
//             errors: result.errors,
//             teacherId,
//             subjectId,
//             processingTime: Date.now() - startTime,
//             nodeId: process.env.NODE_ID || 'node-1'
//           });

//           // Emit to teacher's connected clients
//           await req.io.emitToUser(teacherId, 'attendance-csv-processed', {
//             fileName: req.file.originalname,
//             recordsProcessed: result.recordsProcessed,
//             errors: result.errors,
//             processingTime: Date.now() - startTime
//           });

//           // Check for defaulters in background
//           setImmediate(async () => {
//             try {
//               const defaulters = await checkDefaulters(75);
//               if (defaulters.length > 0) {
//                 await req.io.emitToRole('admin', 'defaulter-alert', {
//                   defaulters,
//                   threshold: 75,
//                   triggeredBy: teacherId,
//                   source: 'csv-upload'
//                 });
//               }
//             } catch (error) {
//               console.error('Error checking defaulters after CSV upload:', error);
//             }
//           });

//           res.json({
//             message: 'CSV processed successfully',
//             recordsProcessed: result.recordsProcessed,
//             errors: result.errors,
//             errorDetails: result.errorDetails,
//             processingTime: Date.now() - startTime,
//             processedInWorker: true
//           });

//         } catch (error) {
//           console.error('CSV processing error:', error);
          
//           // Clean up file on error
//           try {
//             fs.unlinkSync(req.file.path);
//           } catch (unlinkError) {
//             console.error('Error cleaning up file:', unlinkError);
//           }
          
//           res.status(500).json({ 
//             message: 'Error processing CSV',
//             error: error.message 
//           });
//         }
//       })
//       .on('error', (error) => {
//         console.error('CSV reading error:', error);
        
//         // Clean up file on error
//         try {
//           fs.unlinkSync(req.file.path);
//         } catch (unlinkError) {
//           console.error('Error cleaning up file:', unlinkError);
//         }
        
//         res.status(500).json({ 
//           message: 'Error reading CSV file',
//           error: error.message 
//         });
//       });

//   } catch (error) {
//     console.error('CSV upload error:', error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// Utility to generate student email (same as before)
function generateEmail(fullName, type) {
  const parts = fullName.trim().split(" ");
  const firstName = parts[0];
  const lastName = parts.slice(1).join("").replace(/\s+/g, "");
  const year = type?.toUpperCase() === "R" ? "23" : "24";
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${year}@spit.ac.in`;
}

// Upload CSV for student creation
router.post('/upload-students-csv', upload.single('csvFile'), async (req, res) => {
  try {
    const { departmentId, semesterId, adminId } = req.body;
    const results = [];

    // ✅ Step 1: Validate admin, department, and semester
    const adminExist = await Admin.findById(adminId);
    if (!adminExist)
      return res.status(404).json({ success: false, message: "Admin not found" });

    const departmentExists = await Department.findById(departmentId);
    if (!departmentExists)
      return res.status(404).json({ success: false, message: "Department not found" });

    const semesterExists = await Semester.findById(semesterId);
    if (!semesterExists)
      return res.status(404).json({ success: false, message: "Semester not found" });

    if (!req.file)
      return res.status(400).json({ success: false, message: "No file uploaded" });

    console.log(`📁 Reading CSV file: ${req.file.originalname}`);

    // ✅ Step 2: Parse CSV
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          console.log(`🧾 Processing ${results.length} student records...`);
          const insertedStudents = [];
          let count = 0;

          for (const row of results) {
            const {
              UID,
              "NAME OF STUDENTS": name,
              PASSWORD: password,
              DIVISION: division,
              BATCH: batch,
              GENDER: genderCode,
              "REGULAR/DSY": type,
              CONTACT: contactNumber,
            } = row;

            // Normalize gender
            const gender =
              genderCode === "M" ? "Male" :
              genderCode === "F" ? "Female" : "Other";

            // Skip if already exists
            const existing = await Student.findOne({ studentId: UID });
            if (existing) continue;

            // Generate email & hash password
            const email = generateEmail(name, type);
            const hashedPassword = await bcrypt.hash(String(password), 10);

            // Create student
            const student = await Student.create({
              name,
              studentId: String(UID),
              email,
              password: hashedPassword,
              division,
              batch,
              contactNumber: contactNumber === "NA" ? "" : contactNumber,
              gender,
            });

            insertedStudents.push(student);

            // Link to allocations
            const cleanDivision = division?.trim();
            const cleanBatch = batch?.trim() || null;

            // Theory linkage
            await Allocation.updateMany(
              { division: cleanDivision, type: "Theory" },
              { $addToSet: { students: student._id } }
            );

            // Practical linkage
            if (cleanBatch) {
              await Allocation.updateMany(
                { division: cleanDivision, batch: cleanBatch, type: "Practical" },
                { $addToSet: { students: student._id } }
              );
            }

            count++;
            console.log(`✅ ${count} students uploaded so far...`);
          }

          // Delete file after processing
          fs.unlinkSync(req.file.path);

          res.status(201).json({
            success: true,
            message: "Students uploaded successfully and linked to allocations",
            count: insertedStudents.length,
            students: insertedStudents,
          });

        } catch (error) {
          console.error("CSV processing error:", error);
          try { fs.unlinkSync(req.file.path); } catch (_) {}
          res.status(500).json({ success: false, message: "Error processing CSV", error: error.message });
        }
      })
      .on('error', (error) => {
        console.error("CSV reading error:", error);
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        res.status(500).json({ success: false, message: "Error reading CSV file", error: error.message });
      });

  } catch (error) {
    console.error("Upload CSV error:", error);
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    res.status(500).json({ success: false, message: "Server error", error: error.message });
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