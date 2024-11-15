import mongoose from 'mongoose';
import User from '../models/UserModel.js';
import LeaseApplication from '../models/LeaseApplicationModel.js';

/**********************************************Get All Applications of a specific Client  *********************************************/
const getApplicationsClient = async (req, res) => {
    try {
        const applications = await LeaseApplication.find({
            users: { $in: [req.user._id] }
        })
        .populate('agent', 'firstName lastName')  // Populate agent with just firstName and lastName
        .exec();
        
        console.log(applications);
        res.status(200).json(applications);
    } catch(error) {
        console.log(error);
        res.status(500).json({ error: error.message });
    }
}


/**********************************************Get All Applications of a specific Client  *********************************************/
const getApplicationsAgent= async (req, res) => {
    try {
        const applications = await LeaseApplication.find({
            agent: { $in: [req.user._id] }
        })
        .populate('agent', 'firstName lastName')  // Populate agent with just firstName and lastName
        .exec();
        
        console.log(applications);
        res.status(200).json(applications);
    } catch(error) {
        console.log(error);
        res.status(500).json({ error: error.message });
    }
}

/**********************************************Create New Application *******************************************/
const addApplication = async (req, res) => {
    const { 
        location, 
        userIds, 
    } = req.body;

    const user = await User.findById(req.user._id);

    if (user.role !== 'Agent') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const application = await LeaseApplication.create({
            agent: user._id,             // The agent who created the application
            location,                    // Full address of the property
            users: userIds,              // Array of userIds for applicants
        });

        res.status(200).json({ success: 'Application Created.', application });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


/**********************************************Delete Application *******************************************/
const deleteApplication = async (req, res) => {

    //Check if the ID is Valid
    if(!mongoose.Types.ObjectId.isValid(req.params.id)){
        return res.status(400).json({ error: 'Invalid ID' });
    }

    //Check if the Application Exists
    const application = await LeaseApplication.findById(req.params.id);
    if(!application){
        return res.status(404).json({ error: 'Application Not Found' });
    }

    console.log(application);

    //Check if the User is the Owner of the Application
    const user = await User.findById(req.user._id);
    if(!application.agent.equals(user._id)){
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try{
        await application.deleteOne();
        res.status(200).json({ success: 'Application Deleted' });
    }
    catch(error){
        console.log(error);
        res.status(500).json({ error: error.message });
    }
}

/**********************************************Update Application *******************************************/
const updateApplication = async (req, res) => {

    //Check if the ID is Valid
    if(!mongoose.Types.ObjectId.isValid(req.params.id)){
        return res.status(400).json({ error: 'Invalid ID' });
    }

    //Grab Data from the Request Body
    const {location, userEmails} = req.body;
    
    //Check the fields are not empty
    if(!location || !userEmails){
        return res.status(400).json({ msg: 'All fields are required' });
    }

    //Check if the Application Exists
    const application = await LeaseApplication.findById(req.params.id);
    if(!application){
        return res.status(404).json({ error: 'Application Not Found' });
    }

    //Check if the User is the Owner of the Application
    const user = await User.findById(req.user._id);
    if(!application.agent.equals(user._id)){
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Find all users by their emails
    const users = await User.find({ email: { $in: userEmails } });
    if (users.length !== userEmails.length) {
        return res.status(404).json({ msg: 'One or more users not found' });
    }

    //check if all users are clients
    const allUsers = users.every(user => user.role === 'Client');
    if(!allUsers){
        return res.status(400).json({ error: 'All users must be clients' });
    }

    // Extract the ObjectIds of the users
    const userIds = users.map(user => user._id);

    try{
        await application.updateOne({user, location, users: userIds})
        res.status(200).json({ success: 'Application Updated' });
    }
    catch(error){
        res.status(500).json({ error: error.message });
    }
}

export {getApplicationsClient, getApplicationsAgent, addApplication, deleteApplication, updateApplication};