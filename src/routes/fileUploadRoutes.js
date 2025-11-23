const express = require("express");
const fileUploadController = require('../controllers/fileUploadController');
const upload = require('../middlewares/uploadMiddleware');



const router = express.Router();

router.post('/upload', upload.single('file'), fileUploadController.uploadFile);
router.post('/upload-multiple',  upload.array('files', 5), fileUploadController.uploadMultipleFiles);

// Public route to access uploaded files
router.get('/:filename', fileUploadController.getFileByName);

// Protected route to delete files
router.delete('/:filename', fileUploadController.deleteFile);

module.exports = router;
