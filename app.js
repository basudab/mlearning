'use strict';

const dialogflow = require('dialogflow');
const config = require('./config');
const express = require('express');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const request = require('request');
const app = express();
const uuid = require('uuid');


// Messenger API parameters
if (!config.FB_PAGE_TOKEN) {
  throw new Error('missing FB_PAGE_TOKEN');
}
if (!config.FB_VERIFY_TOKEN) {
  throw new Error('missing FB_VERIFY_TOKEN');
}
if (!config.GOOGLE_PROJECT_ID) {
  throw new Error('missing GOOGLE_PROJECT_ID');
}
if (!config.DF_LANGUAGE_CODE) {
  throw new Error('missing DF_LANGUAGE_CODE');
}
if (!config.GOOGLE_CLIENT_EMAIL) {
  throw new Error('missing GOOGLE_CLIENT_EMAIL');
}
if (!config.GOOGLE_PRIVATE_KEY) {
  throw new Error('missing GOOGLE_PRIVATE_KEY');
}
if (!config.FB_APP_SECRET) {
  throw new Error('missing FB_APP_SECRET');
}
if (!config.SERVER_URL) { //used for ink to static files
  throw new Error('missing SERVER_URL');
}
if (!config.SENGRID_API_KEY) { //used for ink to static files
  throw new Error('missing SENGRID_API_KEY');
}
if (!config.EMAIL_FROM) { //used for ink to static files
  throw new Error('missing EMAIL_FROM');
}
if (!config.EMAIL_TO) { //used for ink to static files
  throw new Error('missing EMAIL_TO');
}


app.set('port', (process.env.PORT || 5000))

//verify request came from facebook
app.use(bodyParser.json({
  verify: verifyRequestSignature
}));

//serve static files in the public directory
app.use(express.static('public'));

// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({
  extended: false
}));

// Process application/json
app.use(bodyParser.json());






const credentials = {
  client_email: config.GOOGLE_CLIENT_EMAIL,
  private_key: config.GOOGLE_PRIVATE_KEY,
};

const sessionClient = new dialogflow.SessionsClient({
  projectId: config.GOOGLE_PROJECT_ID,
  credentials
});


const sessionIds = new Map();

// Index route
app.get('/', function(req, res) {
  res.send('Hello world, I am a chat bot')
})

// for Facebook verification
app.get('/webhook/', function(req, res) {
  console.log("request");
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.FB_VERIFY_TOKEN) {
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
})

/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page.
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
app.post('/webhook/', function(req, res) {
  var data = req.body;
  console.log(JSON.stringify(data));



  // Make sure this is a page subscription
  if (data.object == 'page') {
    // Iterate over each entry
    // There may be multiple if batched
    data.entry.forEach(function(pageEntry) {
      var pageID = pageEntry.id;
      var timeOfEvent = pageEntry.time;

      // Iterate over each messaging event
      pageEntry.messaging.forEach(function(messagingEvent) {
        if (messagingEvent.optin) {
          receivedAuthentication(messagingEvent);
        } else if (messagingEvent.message) {
          receivedMessage(messagingEvent);
        } else if (messagingEvent.delivery) {
          receivedDeliveryConfirmation(messagingEvent);
        } else if (messagingEvent.postback) {
          receivedPostback(messagingEvent);
        } else if (messagingEvent.read) {
          receivedMessageRead(messagingEvent);
        } else if (messagingEvent.account_linking) {
          receivedAccountLink(messagingEvent);
        } else {
          console.log("Webhook received unknown messagingEvent: ", messagingEvent);
        }
      });
    });

    // Assume all went well.
    // You must send back a 200, within 20 seconds
    res.sendStatus(200);
  }
});





function receivedMessage(event) {

  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  if (!sessionIds.has(senderID)) {
    sessionIds.set(senderID, uuid.v1());
  }
  //console.log("Received message for user %d and page %d at %d with message:", senderID, recipientID, timeOfMessage);
  //console.log(JSON.stringify(message));

  var isEcho = message.is_echo;
  var messageId = message.mid;
  var appId = message.app_id;
  var metadata = message.metadata;

  // You may get a text or attachment but not both
  var messageText = message.text;
  var messageAttachments = message.attachments;
  var quickReply = message.quick_reply;

  if (isEcho) {
    handleEcho(messageId, appId, metadata);
    return;
  } else if (quickReply) {
    handleQuickReply(senderID, quickReply, messageId);
    return;
  }


  if (messageText) {
    //send message to api.ai
    sendToDialogFlow(senderID, messageText);
  } else if (messageAttachments) {
    handleMessageAttachments(messageAttachments, senderID);
  }
}


function handleMessageAttachments(messageAttachments, senderID) {
  //for now just reply
  sendTextMessage(senderID, "Attachment received. Thank you.");
}

function handleQuickReply(senderID, quickReply, messageId) {
  var quickReplyPayload = quickReply.payload;
  console.log("Quick reply for message %s with payload %s", messageId, quickReplyPayload);
  //send payload to api.ai
  sendToDialogFlow(senderID, quickReplyPayload);
}

//https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-echo
function handleEcho(messageId, appId, metadata) {
  // Just logging message echoes to console
  console.log("Received echo for message %s and app %d with metadata %s", messageId, appId, metadata);
}

function handleDialogFlowAction(sender, action, messages, contexts, parameters) {
  switch (action) {
    case "order-chatbot.order-chatbot-custom":
      if (isDefined(contexts[0]) &&
        (contexts[0].name.includes('order-chatbot-followup') || contexts[0].name.includes('order-chatbot_-_custom_dialog_context')) &&
        contexts[0].parameters) {
        let user_name = (isDefined(contexts[0].parameters.fields['user_name']) &&
          contexts[0].parameters.fields['user_name'] != '') ? contexts[0].parameters.fields['user_name'].stringValue : '';
        let packege_name = (isDefined(contexts[0].parameters.fields['packege_name']) &&
          contexts[0].parameters.fields['packege_name'] != '') ? contexts[0].parameters.fields['packege_name'].stringValue : '';



        if (user_name != '' && packege_name != '') {

          let emailContent = 'A new proposal from' + user_name + 'for the company:' + packege_name + '.';

          sendEmail('New Proposal arrived', emailContent);
          handleMessages(messages, sender);
        } else {
          handleMessages(messages, sender);
        }
      }
      break;

    case "CONTACTUS":
      const bText = "Please choose your desire service";
      const buttons = [{
        "type": "web_url",
        "url": "https://www.facebook.com/programeye",
        "title": "URL",
      }, {
        "type": "phone_number",
        "title": "Talk To Manager",
        "payload": "+8801750471187"
      }, {
        "type": "phone_number",
        "title": "Talk To Agent",
        "payload": "+8801757676725"
      }]
      sendButtonMessage(sender, bText, buttons)
      break;
    case "OURSERVICE":
      const elements = [{
        "title": "Chatbot!",
        "image_url": "https://i.imgur.com/ycHTKOk.jpg",
        "subtitle": "chatbots are the future of engagement between a fan and a brand or celebrity.",

        "buttons": [{
          "type": "web_url",
          "url": "https://www.facebook.com/programeye/",
          "title": "View Website"
        }, {
          "type": "postback",
          "title": "Details",
          "payload": "CHATBOTINT"
        }]
      }, {
        "title": "Data Science!",
        "image_url": "https://i.imgur.com/46GUM05.jpg",
        "subtitle": "Data are becoming the new raw material of business.",

        "buttons": [{
          "type": "web_url",
          "url": "https://www.facebook.com/programeye/",
          "title": "View Website"
        }, {
          "type": "postback",
          "title": "Details",
          "payload": "DATASCIENCEINT"
        }]
      }, {
        "title": "Computer Vision!",
        "image_url": "https://i.imgur.com/QP2yvFU.jpg",
        "subtitle": "computer dentify and process images in the same way that human vision does.",

        "buttons": [{
          "type": "web_url",
          "url": "https://www.facebook.com/programeye/",
          "title": "View Website"
        }, {
          "type": "postback",
          "title": "Details",
          "payload": "VISIONINT"
        }]
      }, {
        "title": "Cyber Security!",
        "image_url": "https://i.imgur.com/0TkbBw7.jpg",
        "subtitle": "Biggest problem in incident response is understanding how the business is using its servers and who has access.",

        "buttons": [{
          "type": "web_url",
          "url": "https://www.facebook.com/programeye/",
          "title": "View Website"
        }, {
          "type": "postback",
          "title": "Details",
          "payload": "CYBERBRANCH"
        }]
      }]
      sendGenericMessage(sender, elements)
      break;

    case "CHATBOTINT":
      const elementss = [{
        "title": "Basic Chatbot!",
        "image_url": "https://i.imgur.com/1qHR96w.jpg",
        "subtitle": "Basic bot will follow rules, which will be pre-determined.",

        "buttons": [{
          "type": "postback",
          "title": "Details",
          "payload": "BASICPKG"
        }]
      }, {
        "title": "Advance Chatbot!",
        "image_url": "https://i.imgur.com/DfShQ7Z.png",
        "subtitle": "Advance Bot with NLP and lots of options.",

        "buttons": [{
          "type": "postback",
          "title": "Details",
          "payload": "ADVANCEPKG"
        }]
      }, {
        "title": "AI Advance Chatbot!",
        "image_url": "https://i.imgur.com/3vveOjS.png",
        "subtitle": "NLP with Storage capacity and many more.",

        "buttons": [{
          "type": "postback",
          "title": "Details",
          "payload": "AIPKG"
        }]
      }]
      sendGenericMessage(sender, elementss)
      break;

    case "DATASCIENCEINT":
      const elementse = [{
        "title": "Predictive Maintenance",
        "image_url": "https://i.imgur.com/zWvlYwP.jpg",
        "subtitle": "Predictive maintenance solutions predict failure and quality issues.",

        "buttons": [{
          "type": "postback",
          "title": "Details",
          "payload": "PREMAIN"
        }]
      }, {
        "title": "Customer Segmentation",
        "image_url": "https://i.imgur.com/j4ezk2I.png",
        "subtitle": "Customer segmentation involves dividing customers into groups.",

        "buttons": [{
          "type": "postback",
          "title": "Details",
          "payload": "CUSTSEG"
        }]
      }, {
        "title": "Customer Churn/response",
        "image_url": "https://i.imgur.com/tRO2duX.png",
        "subtitle": "We look at data from customers that already have churned (response) and their characteristics.",

        "buttons": [{
          "type": "postback",
          "title": "Details",
          "payload": "CUSTCHUR"
        }]
      }, {
        "title": "Text Analytics",
        "image_url": "https://i.imgur.com/hpJ9Qpv.jpg",
        "subtitle": "Text analytics is the process of transposing words into numerical values.",

        "buttons": [{
          "type": "postback",
          "title": "Details",
          "payload": "TEXTANA"
        }]
      }, {
        "title": "Price & Coupon Optimization",
        "image_url": "https://i.imgur.com/KI8lJ60.jpg",
        "subtitle": "Price optimization allows retailers to price their products and services.",

        "buttons": [{
          "type": "postback",
          "title": "Details",
          "payload": "PRICOUOP"
        }]
      }, {
        "title": "Internet Of Things",
        "image_url": "https://i.imgur.com/RmnRmut.jpg",
        "subtitle": "The Internet of Things refers to the interconnection of embedded...",

        "buttons": [{
          "type": "postback",
          "title": "Details",
          "payload": "INTHING"
        }]
      }, {
        "title": "Anything Else!",
        "image_url": "https://i.imgur.com/4PP1hSl.jpg",
        "subtitle": "Our data scientists are equipped to handle a wide range of problems.",

        "buttons": [{
          "type": "postback",
          "title": "Details",
          "payload": "ANYELSE"
        }]
      }]
      sendGenericMessage(sender, elementse)
      break;

    case "VISIONINT":
      const elemente = [{
        "title": "Image Classification",
        "image_url": "https://i.imgur.com/iWV74Y4.png",
        "subtitle": "Automate image categorization and organization...",

        "buttons": [{
          "type": "postback",
          "title": "Details",
          "payload": "IMGCLS"
        }]
      }, {
        "title": "Image Segmentation",
        "image_url": "https://i.imgur.com/aHwu0eB.png",
        "subtitle": "Image segmentation is the process of partitioning a digital image into multiple segments.",

        "buttons": [{
          "type": "postback",
          "title": "Details",
          "payload": "IMGSEG"
        }]
      }, {
        "title": "Object Detection",
        "image_url": "https://i.imgur.com/n8lUVEF.jpg",
        "subtitle": "Automate processes by detecting objects, defects and anomalies in images.",

        "buttons": [{
          "type": "postback",
          "title": "Details",
          "payload": "OBJDECT"
        }]
      }, {
        "title": "Facial Recognition",
        "image_url": "https://i.imgur.com/TudWTQP.jpg",
        "subtitle": "Identify a person from a digital image or video.",

        "buttons": [{
          "type": "postback",
          "title": "Details",
          "payload": "FACEREG"
        }]
      }, {
        "title": "Video Analytics",
        "image_url": "https://i.imgur.com/Z92P7iL.jpg",
        "subtitle": "Analyze video content to determine temporal and spatial events like smoke.",

        "buttons": [{
          "type": "postback",
          "title": "Details",
          "payload": "VIDOANA"
        }]
      }, {
        "title": "Emotion Analysis",
        "image_url": "https://i.imgur.com/UqxIUwy.jpg",
        "subtitle": "Analyze human faces in images and video to detect the sentiments of customers.",

        "buttons": [{
          "type": "postback",
          "title": "Details",
          "payload": "IMOANA"
        }]
      }]
      sendGenericMessage(sender, elemente)
      break;

    case "CYBERBRANCH":
      const element = [{
        "title": "Secure Business Page",
        "image_url": "https://i.imgur.com/1MA7VHL.jpg",
        "subtitle": "Could your company's Facebook Page be easily hacked? We cover the key steps to maintaining a secure social media presence for your business or organization on Facebook.",

        "buttons": [{
          "type": "web_url",
          "url": "https://www.facebook.com/programeye/",
          "title": "View Website"
        }, {
          "type": "postback",
          "title": "Details",
          "payload": "SECUBUSI"
        }]
      }, {
        "title": "Bost Your Page",
        "image_url": "https://i.imgur.com/LfliyuD.png",
        "subtitle": "As the social media networks grow where everyone is connected to one another, marketing becomes highly differentiated in the digital age.",

        "buttons": [{
          "type": "web_url",
          "url": "https://www.facebook.com/programeye/",
          "title": "View Website"
        }, {
          "type": "postback",
          "title": "Details",
          "payload": "BOPAGE"
        }]
      }, {
        "title": "Analyze Your WebSite",
        "image_url": "https://i.imgur.com/cpuR45w.jpg",
        "subtitle": "We provide a wide range of services designed to test whether your staff and partners are ready a real-world attack.",

        "buttons": [{
          "type": "web_url",
          "url": "https://www.facebook.com/programeye/",
          "title": "View Website"
        }, {
          "type": "postback",
          "title": "Details",
          "payload": "ANALPAGE"
        }]
      }]
      sendGenericMessage(sender, element)
      break;
    default:
      //unhandled action, just send back the text
      handleMessages(messages, sender);
  }
}

function handleMessage(message, sender) {
  switch (message.message) {
    case "text": //text
      message.text.text.forEach((text) => {
        if (text !== '') {
          sendTextMessage(sender, text);
        }
      });
      break;
    case "quickReplies": //quick replies
      let replies = [];
      message.quickReplies.quickReplies.forEach((text) => {
        let reply = {
          "content_type": "text",
          "title": text,
          "payload": text
        }
        replies.push(reply);
      });
      sendQuickReply(sender, message.quickReplies.title, replies);
      break;
    case "image": //image
      sendImageMessage(sender, message.image.imageUri);
      break;
  }
}


async function handleCardMessages(messages, sender) {

  let elements = [];
  for (var m = 0; m < messages.length; m++) {
    let message = messages[m];
    let buttons = [];
    for (var b = 0; b < message.card.buttons.length; b++) {
      let isLink = (message.card.buttons[b].postback.substring(0, 4) === 'http');
      let button;
      if (isLink) {
        button = {
          "type": "web_url",
          "title": message.card.buttons[b].text,
          "url": message.card.buttons[b].postback
        }
      } else {
        button = {
          "type": "postback",
          "title": message.card.buttons[b].text,
          "payload": message.card.buttons[b].postback
        }
      }
      buttons.push(button);
    }


    let element = {
      "title": message.card.title,
      "image_url": message.card.imageUri,
      "subtitle": message.card.subtitle,
      "buttons": buttons
    };
    elements.push(element);
  }
  await sendGenericMessage(sender, elements);
}


function handleMessages(messages, sender) {
  let timeoutInterval = 1100;
  let previousType;
  let cardTypes = [];
  let timeout = 0;
  for (var i = 0; i < messages.length; i++) {

    if (previousType == "card" && (messages[i].message != "card" || i == messages.length - 1)) {
      timeout = (i - 1) * timeoutInterval;
      setTimeout(handleCardMessages.bind(null, cardTypes, sender), timeout);
      cardTypes = [];
      timeout = i * timeoutInterval;
      setTimeout(handleMessage.bind(null, messages[i], sender), timeout);
    } else if (messages[i].message == "card" && i == messages.length - 1) {
      cardTypes.push(messages[i]);
      timeout = (i - 1) * timeoutInterval;
      setTimeout(handleCardMessages.bind(null, cardTypes, sender), timeout);
      cardTypes = [];
    } else if (messages[i].message == "card") {
      cardTypes.push(messages[i]);
    } else {

      timeout = i * timeoutInterval;
      setTimeout(handleMessage.bind(null, messages[i], sender), timeout);
    }

    previousType = messages[i].message;

  }
}

function handleDialogFlowResponse(sender, response) {
  let responseText = response.fulfillmentMessages.fulfillmentText;

  let messages = response.fulfillmentMessages;
  let action = response.action;
  let contexts = response.outputContexts;
  let parameters = response.parameters;

  sendTypingOff(sender);

  if (isDefined(action)) {
    handleDialogFlowAction(sender, action, messages, contexts, parameters);
  } else if (isDefined(messages)) {
    handleMessages(messages, sender);
  } else if (responseText == '' && !isDefined(action)) {
    //dialogflow could not evaluate input.
    sendTextMessage(sender, "I'm not sure what you want. Can you be more specific?");
  } else if (isDefined(responseText)) {
    sendTextMessage(sender, responseText);
  }
}

async function sendToDialogFlow(sender, textString, params) {

  sendTypingOn(sender);

  try {
    const sessionPath = sessionClient.sessionPath(
      config.GOOGLE_PROJECT_ID,
      sessionIds.get(sender)
    );

    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: textString,
          languageCode: config.DF_LANGUAGE_CODE,
        },
      },
      queryParams: {
        payload: {
          data: params
        }
      }
    };
    const responses = await sessionClient.detectIntent(request);

    const result = responses[0].queryResult;
    handleDialogFlowResponse(sender, result);
  } catch (e) {
    console.log('error');
    console.log(e);
  }

}




function sendTextMessage(recipientId, text) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: text
    }
  }
  callSendAPI(messageData);
}

/*
 * Send an image using the Send API.
 *
 */
function sendImageMessage(recipientId, imageUrl) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "image",
        payload: {
          url: imageUrl
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a Gif using the Send API.
 *
 */
function sendGifMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "image",
        payload: {
          url: config.SERVER_URL + "/assets/instagram_logo.gif"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send audio using the Send API.
 *
 */
function sendAudioMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "audio",
        payload: {
          url: config.SERVER_URL + "/assets/sample.mp3"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 * example videoName: "/assets/allofus480.mov"
 */
function sendVideoMessage(recipientId, videoName) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "video",
        payload: {
          url: config.SERVER_URL + videoName
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 * example fileName: fileName"/assets/test.txt"
 */
function sendFileMessage(recipientId, fileName) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "file",
        payload: {
          url: config.SERVER_URL + fileName
        }
      }
    }
  };

  callSendAPI(messageData);
}



/*
 * Send a button message using the Send API.
 *
 */
function sendButtonMessage(recipientId, text, buttons) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: text,
          buttons: buttons
        }
      }
    }
  };

  callSendAPI(messageData);
}


function sendGenericMessage(recipientId, elements) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: elements
        }
      }
    }
  };

  callSendAPI(messageData);
}


function sendReceiptMessage(recipientId, recipient_name, currency, payment_method,
  timestamp, elements, address, summary, adjustments) {
  // Generate a random receipt ID as the API requires a unique ID
  var receiptId = "order" + Math.floor(Math.random() * 1000);

  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "receipt",
          recipient_name: recipient_name,
          order_number: receiptId,
          currency: currency,
          payment_method: payment_method,
          timestamp: timestamp,
          elements: elements,
          address: address,
          summary: summary,
          adjustments: adjustments
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a message with Quick Reply buttons.
 *
 */
function sendQuickReply(recipientId, text, replies, metadata) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: text,
      metadata: isDefined(metadata) ? metadata : '',
      quick_replies: replies
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a read receipt to indicate the message has been read
 *
 */
function sendReadReceipt(recipientId) {

  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: "mark_seen"
  };

  callSendAPI(messageData);
}

/*
 * Turn typing indicator on
 *
 */
function sendTypingOn(recipientId) {


  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: "typing_on"
  };

  callSendAPI(messageData);
}

/*
 * Turn typing indicator off
 *
 */
function sendTypingOff(recipientId) {


  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: "typing_off"
  };

  callSendAPI(messageData);
}

/*
 * Send a message with the account linking call-to-action
 *
 */
function sendAccountLinking(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Welcome. Link your account.",
          buttons: [{
            type: "account_link",
            url: config.SERVER_URL + "/authorize"
          }]
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll
 * get the message id in a response
 *
 */
function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v3.2/me/messages',
    qs: {
      access_token: config.FB_PAGE_TOKEN
    },
    method: 'POST',
    json: messageData

  }, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      if (messageId) {
        console.log("Successfully sent message with id %s to recipient %s",
          messageId, recipientId);
      } else {
        console.log("Successfully called Send API for recipient %s",
          recipientId);
      }
    } else {
      console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
    }
  });
}


function greetUserText(userId) {
  request({
    uri: 'https://graph.facebook.com/v4.0/' + userId,
    qs: {
      access_token: config.FB_PAGE_TOKEN
    }
  }, function(error, response, body) {
    if (!error && response.statusCode == 200) {

      var user = JSON.parse(body);
      console.log('getUserData: ' + user);
      if (user.first_name) {
        console.log("FB user: %s %s, %s",
          user.first_name, user.last_name, user.profile_pic);

        sendTextMessage(userId, "Welcome " + user.first_name + ' !' + " We can build a much brighter future" +
          " where humans are relieved of menial work" + " using AI capabilities :) " + " FOR WAKE ME UP :) Please type 'HI'");
      } else {
        console.log("cannot get data for fb user with id", userId);
      }
    } else {
      console.error(response.error);
    }
  });
}
/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 *
 */
function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback
  // button for Structured Messages.
  var payload = event.postback.payload;

  switch (payload) {
    case "GREETINGS":
      greetUserText(senderID);
      sendToDialogFlow(senderID, 'Hi');
      break;
    case "BASICPKG":
      sendToDialogFlow(senderID, 'Basic');
      break;
    case "ADVANCEPKG":
      sendToDialogFlow(senderID, 'Advance');
      break;
    case "AIPKG":
      sendToDialogFlow(senderID, 'Super Ai');
      break;
    case "CHATBOTINT":
      sendToDialogFlow(senderID, 'Chatbot');
      break;
    case "DATASCIENCEINT":
      sendToDialogFlow(senderID, 'datascience');
      break;
    case "VISIONINT":
      sendToDialogFlow(senderID, 'Computer Vision');
      break;
    case "CYBERBRANCH":
      sendToDialogFlow(senderID, 'Cyber Security');
      break;
    case "PREMAIN":
      sendToDialogFlow(senderID, 'Predective Maintenance');
      break;
    case "CUSTSEG":
      sendToDialogFlow(senderID, 'Customer Segmentation');
      break;
    case "CUSTCHUR":
      sendToDialogFlow(senderID, 'Customer Churn');
      break;
    case "TEXTANA":
      sendToDialogFlow(senderID, 'Text Analytics');
      break;
    case "PRICOUOP":
      sendToDialogFlow(senderID, 'Coupon Optimization');
      break;
    case "INTHING":
      sendToDialogFlow(senderID, 'Internet of Things');
      break;
    case "ANYELSE":
      sendToDialogFlow(senderID, 'Anything Else');
      break;
    case "IMGCLS":
      sendToDialogFlow(senderID, 'Image Classification');
      break;
    case "IMGSEG":
      sendToDialogFlow(senderID, 'Image Segmentation');
      break;
    case "OBJDECT":
      sendToDialogFlow(senderID, 'Object Detection');
      break;
    case "FACEREG":
      sendToDialogFlow(senderID, 'Facial Recognition');
      break;
    case "VIDOANA":
      sendToDialogFlow(senderID, 'Video Analytics');
      break;
    case "IMOANA":
      sendToDialogFlow(senderID, 'Emotion Analysis');
      break;
    case "SECUBUSI":
      sendToDialogFlow(senderID, 'Secure Business');
      break;
    case "BOPAGE":
      sendToDialogFlow(senderID, 'Bost Your Page');
      break;
    case "ANALPAGE":
      sendToDialogFlow(senderID, 'Analyze Your WebSite');
      break;
    case "CONTACTUS":
      sendToDialogFlow(senderID, 'Mobile Number');
      break;

    default:
      //unindentified payload
      sendTextMessage(senderID, "I'm not sure what you want. Can you be more specific?");
      break;

  }

  console.log("Received postback for user %d and page %d with payload '%s' " +
    "at %d", senderID, recipientID, payload, timeOfPostback);

}


/*
 * Message Read Event
 *
 * This event is called when a previously-sent message has been read.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
 *
 */
function receivedMessageRead(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;

  // All messages before watermark (a timestamp) or sequence have been seen.
  var watermark = event.read.watermark;
  var sequenceNumber = event.read.seq;

  console.log("Received message read event for watermark %d and sequence " +
    "number %d", watermark, sequenceNumber);
}

/*
 * Account Link Event
 *
 * This event is called when the Link Account or UnLink Account action has been
 * tapped.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
 *
 */
function receivedAccountLink(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;

  var status = event.account_linking.status;
  var authCode = event.account_linking.authorization_code;

  console.log("Received account link event with for user %d with status %s " +
    "and auth code %s ", senderID, status, authCode);
}

/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
function receivedDeliveryConfirmation(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var delivery = event.delivery;
  var messageIDs = delivery.mids;
  var watermark = delivery.watermark;
  var sequenceNumber = delivery.seq;

  if (messageIDs) {
    messageIDs.forEach(function(messageID) {
      console.log("Received delivery confirmation for message ID: %s",
        messageID);
    });
  }

  console.log("All message before %d were delivered.", watermark);
}

/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to
 * Messenger" plugin, it is the 'data-ref' field. Read more at
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
 *
 */
function receivedAuthentication(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfAuth = event.timestamp;

  // The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
  // The developer can set this to an arbitrary value to associate the
  // authentication callback with the 'Send to Messenger' click event. This is
  // a way to do account linking when the user clicks the 'Send to Messenger'
  // plugin.
  var passThroughParam = event.optin.ref;

  console.log("Received authentication for user %d and page %d with pass " +
    "through param '%s' at %d", senderID, recipientID, passThroughParam,
    timeOfAuth);

  // When an authentication is received, we'll send a message back to the sender
  // to let them know it was successful.
  sendTextMessage(senderID, "Authentication successful");
}

/*
 * Verify that the callback came from Facebook. Using the App Secret from
 * the App Dashboard, we can verify the signature that is sent with each
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
  var signature = req.headers["x-hub-signature"];

  if (!signature) {
    throw new Error('Couldn\'t validate the signature.');
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];

    var expectedHash = crypto.createHmac('sha1', config.FB_APP_SECRET)
      .update(buf)
      .digest('hex');

    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}

function sendEmail(subject, content) {
  console.log('sending email');
  var helper = require('sendgrid').mail;

  var from_email = new helper.Email(config.EMAIL_FROM);
  var to_email = new helper.Email(config.EMAIL_TO);
  var subject = subject;
  var content = new helper.Content("text/html", content);
  var mail = new helper.Mail(from_email, subject, to_email, content);

  var sg = require('sendgrid')(config.SENGRID_API_KEY);
  var request = sg.emptyRequest({
    method: 'POST',
    path: '/v3/mail/send',
    body: mail.toJSON()
  });

  sg.API(request, function(error, response) {
    console.log(response.statusCode)
    console.log(response.body)
    console.log(response.headers)
  })

}


function isDefined(obj) {
  if (typeof obj == 'undefined') {
    return false;
  }

  if (!obj) {
    return false;
  }

  return obj != null;
}

// Spin up the server
app.listen(app.get('port'), function() {
  console.log('running on port', app.get('port'))
})