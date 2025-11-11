const fs = require('fs');
const path = require('path');



exports.uploadFile = (req, res) => {
  console.log("hiiiiiiiiii");
  
    try {
      if (!req.file) {
        return res.status(400).json({ 
          success: false, 
          message: 'No file uploaded' 
        });
      }
      
      // Return file information
      res.status(201).json({
        success: true,
        message: 'File uploaded successfully',
        data: {
          filename: req.file.filename,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          path: req.file.path.replace(/\\/g, '/'),
          url: `${req.protocol}://${req.get('host')}/${req.file.path.replace(/\\/g, '/')}`
        }
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  };
  
  // Handle multiple file uploads
  exports.uploadMultipleFiles = (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'No files uploaded' 
        });
      }
      
      const fileInfos = req.files.map(file => ({
        filename: file.filename,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path.replace(/\\/g, '/'),
        url: `${req.protocol}://${req.get('host')}/${file.path.replace(/\\/g, '/')}`
      }));
      
      res.status(201).json({
        success: true,
        message: `${req.files.length} files uploaded successfully`,
        data: fileInfos
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  };
  
  // Get file by filename
  exports.getFileByName = (req, res) => {
    try {
      const filename = req.params.filename;
      
      // Check in documents directory first
      let filePath = path.join(__dirname, '../../uploads/documents', filename);
      
      if (!fs.existsSync(filePath)) {
        // If not in documents, check in images directory
        filePath = path.join(__dirname, '../../uploads/images', filename);
        
        if (!fs.existsSync(filePath)) {
          // Try checking in the root uploads directory as a fallback
          filePath = path.join(__dirname, '../../uploads', filename);
          
          if (!fs.existsSync(filePath)) {
            return res.status(404).json({
              success: false,
              message: 'File not found'
            });
          }
        }
      }
      
      // Send the file
      res.sendFile(filePath);
    } catch (error) {
      // Log the specific error for debugging
      console.error('Error retrieving file:', error);
      
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  };
  
  // Delete file
  exports.deleteFile = (req, res) => {
    try {
      const filename = req.params.filename;
      
      // Check in documents directory first
      let filePath = path.join(__dirname, '../../uploads/documents', filename);
      let fileFound = false;
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        fileFound = true;
      } else {
        // If not in documents, check in images directory
        filePath = path.join(__dirname, '../../uploads/images', filename);
        
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          fileFound = true;
        }
      }
      
      if (!fileFound) {
        return res.status(404).json({
          success: false,
          message: 'File not found'
        });
      }
      
      res.json({
        success: true,
        message: 'File deleted successfully'
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  };