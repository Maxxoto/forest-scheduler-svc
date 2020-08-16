/* eslint-disable comma-dangle */
/* eslint-disable no-constant-condition */
/* eslint-disable camelcase */
/* eslint-disable object-curly-newline */

// Modules
const moment = require('moment');
const mongoose = require('mongoose');
const fetch = require('node-fetch');
const keys = require('../config/keys');
// Email Template
const surveyTemplate = require('../services/emailTemplates');

// Mongoose model
const Notification = mongoose.model('notification');

// Import Class Mailer Model
const Mailer = require('../services/Mailer');

// Middleware
const requireBatch = require('../middlewares/requireBatchID');

module.exports = (app) => {
  app.post('/api/notification', requireBatch, async (req, res) => {
    const { send_at, title, subject, body, attendances, type } = req.body;

    const RFC2822 = 'ddd, DD MMM YYYY HH:mm:ss [GMT]'; // Setup format RFC to avoid deprecated momentjs

    // Convert local time to UTC and formatting to RFC2822
    const ISOdate = moment.utc(new Date(send_at)).format(RFC2822);
    // Convert Unix
    const unixDate = moment(ISOdate).unix();

    // NOTE : Sendgrid only allow 48 Hours scheduled send
    try {
      const notification = new Notification({
        title,
        subject,
        body,
        attendances: attendances.split(',').map((email) => ({
          email: email.trim(),
        })),
        batch_id: res.locals.batchID,
        dateSent: send_at,
        dateSentUnix: unixDate,
        type,
      });

      try {
        if (type.includes('mail')) {
          const mailer = new Mailer(notification, surveyTemplate(notification));

          await mailer.send();
        }
        if (type.includes('sms')) {
          // This contain create sms object or calls
        }

        await notification.save();

        res.send({
          message: 'Successfully send an email',
        });
      } catch (e) {
        res.status(422).send(e);
      }
    } catch (error) {
      res.send({ message: `Error ${error}` });
    }
  });

  app.post('/api/notification/webhooks', async (req, res) => {
    const result = req.body;

    // Version 1 All Sendgrid Object

    // const { sendgridId } = result[0];
    // const notification = await Notification.findOneAndUpdate(
    //   { sendgridId },
    //   { events: result },
    //   { new: true, useFindAndModify: false }
    // ).exec();

    // Version 2 Minify Sendgrid Object
    const obj = result.map((val) => {
      const { batch_id, event, email, reason } = val;
      const statusObj = {
        batch_id,
        email,
        status: event,
        reason,
      };
      return statusObj;
    });
    const { batch_id } = obj[0];

    try {
      await Notification.findOneAndUpdate(
        { batch_id },
        { events: obj },
        { new: true, useFindAndModify: false }
      ).exec();
    } catch (error) {
      res.status(422).send({ message: error });
    }

    console.log(result); // to print webhook result
  });

  //   Get All Notification
  app.get('/api/notification', async (req, res) => {
    try {
      const result = await await Notification.find()
        .sort({ updatedAt: -1 })
        .exec();
      res.send({
        code: '200',
        message: 'Successfully fetch notification',
        data: result,
      });
    } catch (error) {
      res.status(422).send({ message: error });
    }
  });

  //   Get Single Notification
  app.get('/api/notification/:notificationID', async (req, res) => {
    const { notificationID } = req.params;
    try {
      const result = await Notification.findOne({ _id: notificationID }).exec();
      res.send({
        code: '200',
        message: 'Successfully fetch notification',
        data: result,
      });
    } catch (error) {
      res.status(422).send({ message: error });
    }
  });

  //   Cancel Scheduled Notification
  app.post(
    '/api/notification/:notificationID/action=:status',
    async (req, res) => {
      const { notificationID, status } = req.params;
      try {
        const result = await Notification.findOneAndUpdate(
          { _id: notificationID },
          { events: status },
          { new: true, useFindAndModify: false }
        ).exec();

        const sendgridCancel = await fetch(
          'https://api.sendgrid.com/v3/user/scheduled_sends',
          {
            method: 'POST',
            body: '',
            headers: {
              Authorization: `Bearer ${keys.sendGridKey}`,
            },
          }
        );

        res.send({
          code: '200',
          message: 'Notification will be cancelled !',
          data: result,
        });
      } catch (error) {
        res.status(422).send({ message: error });
      }
    }
  );
};
