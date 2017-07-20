var request = require('request');

var departments = ['CEO', 'PAD', 'VL', 'SEC', 'SCHO', 'FIN', 'HR'];

module.exports = function (context, cb) {
  if (context.data.view || context.query.view) {
    handleView();
  }
  if (context.data.code) {
    handleRequestCode();
  }
  
  if (context.data.inboundSMSMessageList) {
    handleSMSReceive();
  }
  
  cb(null, 'Your request was received and processed.');
  
  function handleView() {
    context.storage.get(function(error, data) {
      var registeredNumbers = Object.keys(data.tokens);
      
      console.log('Registered numbers:');
      console.log(registeredNumbers);
      
      console.log('Agenda:');
      console.log(data.agenda);
    });
  }
  
  function handleRequestCode() {
    var code = context.data.code;
    
    request.post('http://developer.globelabs.com.ph/oauth/access_token', {
      json: {
        app_id: /* */,
        app_secret: /* */,
        code: code
      }
    }, function(error, response, body) {
      if (error) {
        console.log(error);
      }
      else {
        console.log('Access token for tel:+63' + body.subscriber_number + ' saved.');
        saveToken('tel:+63' + body.subscriber_number, body.access_token);
      }
    });
  }
  
  function saveToken(number, access_token, callback) {
    context.storage.get(function (error, data) {
      if (!data) {
        data = {};
      }
      
      if (!data.tokens) {
        data.tokens = {};
      }
      
      data.tokens[number] = access_token;
      
      context.storage.set(data, function(error, data) {
        if (typeof callback === 'function') {
          callback();
        }
      });
    });
  }
  
  function handleSMSReceive() {
    var messages = context.data.inboundSMSMessageList.inboundSMSMessage;
  
    messages.forEach(function(message) {
      var sender = message.senderAddress;
      var text = message.message;
      
      if (!text) {
        sendSMS(sender, 'Stop giving me blank messages');
      }
      
      var splittedText = text.split('\n').map(function(text) {
        return text.trim();
      });
      
      // check for AGENDA text
      if (splittedText[0] === 'AGENDA') {
        handleAgenda();
      }
      else if(splittedText[0] === 'START') {
        handleResetData();
      }
      else {
        sendSMS(sender, 'Huh what? I don\'t understand you! I\'m a bot, I only know how to collect your agenda.');
      }
      
      function handleResetData() {
        context.storage.get(function(error, data) {
          data.agenda = {};
          
          context.storage.set(data, function(error) {
            if (error) {
              console.log(error);
              sendSMS(sender, 'Oops, uhm, I got an error. Tell Peter about this!');
            }
            else {
              sendSMS(sender, 'Got it boss. I\'m gonna collect the agenda for the next meeting. I\'ll also inform the Exec to send their agenda to me. :)');
              
              var execNumbers = Object.keys(data.tokens);
              
              execNumbers.forEach(function(execNumber) {
                sendSMS(execNumber, 'Hello exec! Please send your agenda to me for the upcoming meeting.\n\nFormat:\n\nAGENDA\nYOUR_DEPARTMENT (CEO/PAD/SCHO/etc.)\nAgenda 1\nAgenda 2');
              });
            }
          });
        });
      }
      
      function handleAgenda() {
        var department = splittedText[1];
        
        // check if department is valid
        if (departments.indexOf(department) < 0) {
          sendSMS(sender, 'Lol what department is ' + department + '? I don\'t know that. I only know the abbreviated ones (PAD, CEO, SCHO, etc.).');
          return;
        }
        
        var agenda = splittedText.slice(2);
        
        // send to sms
        setAgendaToStorage(department, agenda, function() {
          context.storage.get(function (error, data) {
            if (error) {
              console.log(error);
              sendSMS(sender, 'Oops, uhm, I got an error. Tell Peter about this!');
            }
            else {
              sendSMS(sender, 'Hello ' + department + ', I got your agenda. Thanks!');
              
              var agendaObj = data.agenda;
              
              var deptWithAgenda = departments.filter(function(department) {
                return Object.keys(agendaObj).indexOf(department) >= 0;
              });
              
              var deptWithoutAgenda = departments.filter(function(department) {
                return Object.keys(agendaObj).indexOf(department) === -1;
              });
              
              var deptWithAgendaMsg = deptWithAgenda.map(function(department) {
                return department + ':\n' + agendaObj[department].map(function(agenda) {
                  return '- ' + agenda;
                })
                  .join('\n');
              }).join('\n\n');
              
              var deptWithoutAgendaMsg = deptWithoutAgenda.join(', ') + ' still have not yet sent their agenda.';
              
              sendSMS('tel:<number hidden>', 'Hi Almer!\n\n' + department + ' has updated their agenda.\n\nExec Meeting Agenda:\n\n' + deptWithAgendaMsg + (deptWithoutAgenda.length > 0 ? ('\n\n' + deptWithoutAgendaMsg) : ''));
              
              sendSMS('tel:<number hidden>', 'Hi Master Peter!\n\n' + department + ' has updated their agenda.\n\nExec Meeting Agenda:\n\n' + deptWithAgendaMsg + (deptWithoutAgenda.length > 0 ? ('\n\n' + deptWithoutAgendaMsg) : ''));
            }
          });
        });
      }
    });
  }
  
  function setAgendaToStorage(department, agenda, callback) {
    context.storage.get(function (error, data) {
      if (!data) {
        data = {};
      }
      
      if (!data.agenda) {
        data.agenda = {};
      }
      
      data.agenda[department] = agenda.filter(function(agendum) {
        return agendum !== '';
      });
      
      context.storage.set(data, function(error, data) {
        if (typeof callback === 'function') {
          callback();
        }
      });
    });
  }
  
  function sendSMS(number, message) {
    context.storage.get(function(error, data) {
      var shortCode = /* */;
      var accessToken = data.tokens[number];
      
      request.post('https://devapi.globelabs.com.ph/smsmessaging/v1/outbound/' + shortCode + '/requests?access_token=' + accessToken, {
        json: {
          "outboundSMSMessageRequest": {
            "senderAddress": "tel:" + shortCode,
            "outboundSMSTextMessage": {
              "message": message
            },
            "address": [number]
          }
        }
      }, function(error, response, body) {
        if (error) {
          console.log(error);
        }
        else {
          console.log('Sent SMS to ' + number + '.');
        }
      });
    });
  }
}
