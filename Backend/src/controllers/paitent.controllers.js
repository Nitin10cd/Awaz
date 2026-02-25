import prisma from "../Prisma.js";

// controller for paitent creation
export const createPatient = async (request, response, next) => {
    // proper error handling useing the try catch block
    try {
        // taking the values
        const { name, dob, phone , address, diagnosis } = request.body;
        
        // validation checks is all the values exists or not
        if (!name || !dob || !phone || !address || !diagnosis) {
            // response back the error and the proper message for all the req fileds
            return response.status(400).json({
                success: false, 
                message: "All fields Are Required"
            });
        }

        // create the paitent if the all fields are avaiable
        const paitent = await prisma.patient.create({
            data: {
                name,
                dob: new Date(dob),
                phone,
                address,
                diagnosis,
            }
        });

        // response back with the success and the message
        return response.status(201).json({
            success: true,
            data: paitent
        })
    } catch (error) {
        next(error);
    }
}

// get the paitent by the name 
export const getPatientByName = async (request, response , next) => {
    // try catch hanfling
    try {
        // taking name from the query 
        const { name } = request.query;
        
        // validating name
        if (!name) {
            return response.status(400).json({success: false, message: "Name is Required"});
        }

        // finding the paitent from the database
        const paitent = await prisma.patient.findFirst({
            where: {name},
        });

        // case if the paitent is not created
        if (!paitent) {
            return response.status(404).json({success: false, 
                message: "Paitent not found"
            })
        }
         
        // return resopnse as success
        response.json({success: true, data: paitent});
    } catch (error) {
        next(error);
    }
}