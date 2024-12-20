import mongoose from 'mongoose';
import Task from '../models/TaskModel.js';
import User from '../models/UserModel.js';
import LeaseApplication from '../models/LeaseApplicationModel.js';
import multer from 'multer';
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"
import multerS3 from 'multer-s3';
import path from 'path';
import 'dotenv/config.js';

// AWS S3 Config
const s3Client = new S3Client({
    region: process.env.S3_BUCKET_REGION,
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
});

const upload = (bucketName) => {
    return multer({
        storage: multerS3({
            s3: s3Client,
            bucket: bucketName,
            metadata: function (req, file, cb) {
                cb(null, { fieldName: file.fieldname });
            },
            key: function (req, file, cb) {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
            }
        })
    });
};

const uploadDocument = async (req, res) => {
    const uploadSingle = upload(process.env.S3_BUCKET_NAME).single('file-upload');

    uploadSingle(req, res, async (err) => {
        if (err) {
            console.error('Multer error:', err);
            return res.status(400).json({ error: err.message });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { taskId } = req.body; // Assuming taskId is passed in the request body

        if (!taskId) {
            return res.status(400).json({ error: 'Task ID is required' });
        }

        try {
            // Find the task
            const task = await Task.findById(taskId);

            if (!task) {
                return res.status(404).json({ error: 'Task not found' });
            }

            // Update the task with file details
            task.fileUrl = req.file.location; // S3 file URL
            task.fileType = req.file.mimetype; // Store file MIME type
            if (req.body.status) task.status = req.body.status; // Optionally update task status

            await task.save();

            res.status(200).json({
                message: 'File uploaded and task updated successfully',
                task,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error updating task in database' });
        }
    });
};




const assignTask = async (req, res) => {
    const { title, description, type, assigned_to, applicationId } = req.body;

    //Check the fields are not empty
    if(!title || !type || !assigned_to || !applicationId){
        return res.status(400).json({ msg: 'All fields are required' });
    }

    //Check if the ID is Valid
    if(!mongoose.Types.ObjectId.isValid(applicationId)){
        return res.status(400).json({ error: 'Invalid ID' });
    }

    //Check if the Application Exists
    const application = await LeaseApplication.findById(applicationId);
    if(!application){
        return res.status(404).json({ error: 'Application Not Found' });
    }

    console.log(application);

    //Grab the authenticated user from the request body
    const user = await User.findById(req.user._id);

    //Check if the User is the Owner of the Application
    if(!application.agent.equals(user._id)){
        return res.status(401).json({ error: 'Unauthorized' });
    }

    //check if the user is an agent
    if(user.role !== 'Agent'){
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Find the userAssigned by their id
    const userAssigned = await User.findById(assigned_to );
    if (!userAssigned) {
        return res.status(404).json({ msg: 'User not found' });
    }

    //check if the userAssigned is a client
    if(userAssigned.role !== 'Client'){
        return res.status(400).json({ error: 'User must be a client' });
    }

    try{
        // Create a new task object and save to db
        const task = await Task.create({title, description, type, assigned_to, leaseApplication: application._id});
        res.status(200).json({ success: 'Task Created.', task });
    } catch (err) {
        res.status(500).send(err);
    }
}

const getTasksClient = async (req, res) => {
    try {
        const { clientId, applicationId } = req.params;

        // Find tasks assigned to the client within the specified application
        const tasks = await Task.find({ 
            assigned_to: clientId, 
            leaseApplication: applicationId 
        });

        res.status(200).json(tasks);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
};

const getApplicationTasks = async (req, res) => {
    try {
        const { applicationId } = req.params;

        // Find tasks assigned to the client within the specified application
        const tasks = await Task.find({ leaseApplication: applicationId });

        res.status(200).json(tasks);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
}

const getTaskDetails = async (req, res) => {
    try {
        const { taskId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(taskId)) {
            return res.status(400).json({ error: 'Invalid Task ID' });
        }

        const task = await Task.findById(taskId);

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        res.status(200).json(task);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
};

const getFile = async (req, res) => {
    const { url, fileType } = req.body; // File type now passed with the request

    if (!url) {
        return res.status(400).json({ error: 'File URL is required' });
    }

    const key = url.split('/').pop(); // Extract the file key from the URL

    const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key,
    };

    try {
        const command = new GetObjectCommand(params);
        const fileStream = await s3Client.send(command);

        // Use provided fileType or fallback to S3's ContentType
        const contentType = fileType;

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${key}"`);

        // Stream the file content to the response
        fileStream.Body.pipe(res);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error fetching file from S3' });
    }
};

//submit task changes status from pending to submitted
const submitTask = async (req, res) => {
    const { taskId } = req.body;

    if (!taskId) {
        return res.status(400).json({ error: 'Task ID is required' });
    }

    try {
        const task = await Task.findById(taskId);

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        task.status = 'submitted';
        await task.save();

        res.status(200).json({ message: 'Task submitted successfully', task });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error updating task in database' });
    }
};

const approveTask = async (req, res) => {
    const { taskId } = req.body;

    if (!taskId) {
        return res.status(400).json({ error: 'Task ID is required' });
    }

    try {
        const task = await Task.findById(taskId);

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        task.status = 'completed';
        await task.save();

        res.status(200).json({ message: 'Task approved successfully', task });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error updating task in database' });
    }
};

const sendBackTask = async (req, res) => {
    try {
      const { taskId, comments } = req.body;
  
      // Logic to update task status to "pending" and save comments
      await Task.findByIdAndUpdate(taskId, {
        status: 'pending',
        comments,
      });
  
      res.status(200).send({ message: 'Task sent back to pending with comments.' });
    } catch (error) {
      res.status(500).send({ message: 'Failed to send task back.', error: error.message });
    }
};
  




export { assignTask, getTasksClient, getApplicationTasks, uploadDocument, getTaskDetails, getFile, submitTask, approveTask, sendBackTask};


