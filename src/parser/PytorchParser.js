import { getPointName, FormatParamInputs, dent } from "./FlowOrder";


function getStateName(key, flowpoints, states, init_states) {
  if (init_states.includes(key)) {
    return 'self.' + getPointName(flowpoints, key) + '_state'
  }
  return states[key]
}


function getOutputTargetName(key, flowpoints) {
  return getPointName(flowpoints, key) + '_target'
}


function PyTorchImports(indent) {
  var msg = '# Importing PyTorch tools'
  msg += '\nimport torch, torchvision'
  msg += '\nfrom torch import nn, optim, cuda'
  msg += '\n\n\n# Importing other libraries'
  msg += '\nimport numpy as np'
  msg += '\nimport matplotlib.pyplot as plt'
  msg += '\nimport time'
  return msg
}



function Constructor(state, order, indent, dummies, states, init_states, got_hidden_states, library, modelID) {

  var flowpoints = state.flowpoints;
  var environment = state.environment;

  let modelname = environment.modelname === '' ? 'NeuralNet' : environment.modelname
  
  // Basics
  var msg = '# Model'
  msg += '\nclass ' + modelname + '(nn.Module):'
  msg += '\n\n\n' + dent(indent, 1) + 'def __init__(self):'
  msg += '\n\n' + dent(indent, 2) + '# Basics'
  msg += '\n' + dent(indent, 2) + 'super(' + modelname + ', self).__init__()'
  msg += '\n' + dent(indent, 2) + 'self.name        = ' + (modelID ? ("'" + modelID + "'") : "'model'")
  msg += '\n' + dent(indent, 2) + 'self.batch_first = ' + (environment.batch_first ? 'True' : 'False')

  // Prep aligning recurrent states
  var max_l = 0;
  order.map(key => {
    let dummy = dummies[key];
    if (dummy.is_recurrent) {
      max_l = Math.max(max_l, getStateName(key, flowpoints, states, init_states).length);
    }
  })

  // Initializing recurrent states
  if (max_l > 0) {
    var state_msg = dent(indent, 2) + '# Initializing states with placeholder tensors';
    order.map(key => {
      let dummy = dummies[key];
      if (dummy.is_recurrent) {

        // Init state
        state_msg += '\n' + dent(indent, 2) + getStateName(key, flowpoints, states, init_states)

        // Aligning equals sign
        for (var i = 0; i < max_l - getStateName(key, flowpoints, states, init_states).length; i++) state_msg += ' '
        state_msg += ' = torch.tensor([0], dtype=torch.float64)'

      }
    })
    msg += '\n\n' + state_msg
  }

  // Initializing all layers
  msg += '\n\n' + dent(indent, 2) + '# Initializing all layers'
  order.map(key => {
    let point = flowpoints[key];
    
    if (point.base_ref === 'Concatenate') {

    } else if (point.base_ref === 'Input') {

    } else if (point.base_ref === 'Flatten') {

    } else if (point.base_ref !== 'Mean' && point.base_ref !== 'Maximum') {
      if (flowpoints[key].content[library]) {
        let content = point.content[environment.library.toLowerCase()];
        let parameters = content.parameters

        // Getting longest parameter name
        var max_l = 0;
        Object.keys(parameters).map(p_key => {
          if (p_key !== 'extras') max_l = Math.max(p_key.length, max_l)
        })

        // Init object
        let prefix = content.parameters.extras.torchvision ? 'torchvision.models.' : 'nn.'
        msg += '\n' + dent(indent, 2) + 'self.' + getPointName(flowpoints, key) + ' = ' + prefix + content.reference + '(';

        // Adding arguments
        Object.keys(parameters).map(p_key => {

          if (p_key !== 'extras') {

            let param = parameters[p_key];
          
            // Adding argument
            msg += '\n' + dent(indent, 3) + p_key

            // Aligning with other arguments
            for (var i = 0; i < max_l - p_key.length; i++) msg += ' '
            msg += ' = '

            // Adding argument values
            if (param.istuple) {
              // Tuples are put in between parantheses
              msg += '(';
              param.value.map(val => msg += (val === '' ? (param.min === Infinity ? 0 : param.min) : val) + ',');
              msg = msg.substring(0, msg.length - 1) + ')';
            } else if (param.type === 'select') {
              msg += "'" + param.value + "'";
            } else if (param.type === 'bool') {
              if (p_key === 'batch_first') {
                msg += 'self.batch_first'
              } else {
                msg += (param.value === true ? 'True' : 'False')
              }
            } else {
              msg += (param.value === '' ? 'None' : param.value)
            }
            msg += ','

          }

        })
        if (max_l > 0) msg += '\n' + dent(indent, 2)
        msg += ')'
      }
    }
  })

  // Startup routines
  if (got_hidden_states) {
    msg += '\n\n' + dent(indent, 2) + '# Running startup routines'
    msg += '\n' + dent(indent, 2) + 'self.reset_hidden_states()'
  }

  // Returning
  return msg

}


function ResetHidden(flowpoints, order, inps, states, dummies, indent, init_states, library) {
  var msg = dent(indent, 1) + 'def reset_hidden_states(self, sample=None):'
  msg += '\n' + dent(indent, 2) + 'if type(sample) == torch.Tensor:'
  msg += '\n' + dent(indent, 3) + 'batch_size = sample.shape[0 if self.batch_first else 1]'
  order.map(key => {
    if (flowpoints[key].base_ref !== 'Input') {
      if (flowpoints[key].content[library]) {
        const parameters = flowpoints[key].content[library].parameters;
        if (parameters.extras.gothidden) {
          if (parameters['hidden_size'] && parameters['num_layers']) {
            msg += '\n' + dent(indent, 3) + 'self.' + getPointName(flowpoints, key) + '_hidden = '
            const hidden = '\n' + dent(indent, 4) + 'torch.zeros((' + parameters['num_layers'].value + ', batch_size, ' + parameters['hidden_size'].value + '), device=sample.device)'
            msg += '(' + hidden + ', ' + hidden + '\n' + dent(indent, 3) + ')'
          }
        }
      }
    }
  })
  msg += '\n' + dent(indent, 2) + 'else:'
  order.map(key => {
    if (flowpoints[key].base_ref !== 'Input') {
      if (flowpoints[key].content[library]) {
        if (flowpoints[key].content[library].parameters.extras.gothidden) {
          msg += '\n' + dent(indent, 3) + 'self.' + getPointName(flowpoints, key) + '_hidden = None'
        }
      }
    }
  })
  return msg
}


function Forward(flowpoints, order, inps, states, dummies, indent, init_states, got_hidden_states, library) {
  var msg = dent(indent, 1) + 'def forward(self, '

  // Adding all inputs
  const formated_inputs = FormatParamInputs(dummies, inps);
  msg += formated_inputs + '):'

  // Forwarding
  var step_lib = [];
  var outputs = [];
  order.map(key => {
    const point = dummies[key];
    if (point.base_ref === 'Concatenate') {
      var step_msg = dent(indent, 2) + getStateName(key, flowpoints, states, init_states)
      step_msg += ' = torch.cat(['
      point.inputs.map(inp_key => step_msg += getStateName(inp_key, flowpoints, states, init_states) + ', ')
      step_msg = step_msg.substring(0, step_msg.length - 2) + '], dim=' + flowpoints[key].content.pytorch.parameters.dim.value + ')'
      step_lib.push({ msg:step_msg, title:'Concatenate' })
    } else if (point.base_ref === 'Mean') {
      var step_msg = dent(indent, 2) + getStateName(key, flowpoints, states, init_states)
      step_msg += ' = torch.mean('
      point.inputs.map(inp_key => step_msg += getStateName(inp_key, flowpoints, states, init_states) + ' + ')
      step_msg = step_msg.substring(0, step_msg.length - 3) + ', dim=' + flowpoints[key].content.pytorch.parameters.dim.value + ')'
      step_lib.push({ msg:step_msg, title:'Mean' })
    } else if (point.base_ref === 'Maximum') {
      var step_msg = dent(indent, 2) + getStateName(key, flowpoints, states, init_states)
      step_msg += ' = torch.max('
      point.inputs.map(inp_key => step_msg += getStateName(inp_key, flowpoints, states, init_states) + ' + ')
      step_msg = step_msg.substring(0, step_msg.length - 3) + ', dim=' + flowpoints[key].content.pytorch.parameters.dim.value + ')[0]'
      step_lib.push({ msg:step_msg, title:'Max' })
    } else if (point.base_ref === 'Input') {

    } else if (point.base_ref === 'Flatten') {
      let sn1 = getStateName(key, flowpoints, states, init_states)
      let sn2 = getStateName(point.inputs[0], flowpoints, states, init_states)
      var step_msg = dent(indent, 2) + sn1
      step_msg += ' = ' + sn2 + '.view(' + sn2 + '.shape[0], -1)'
      step_lib.push({ msg:step_msg, title:'Flatten' })
    } else {
      if (flowpoints[key].content[library]) {
        var step_msg = dent(indent, 2) + getStateName(key, flowpoints, states, init_states)
        if (flowpoints[key].content.pytorch.parameters.extras.gothidden) step_msg += ', self.' + getPointName(flowpoints, key) + '_hidden'
        step_msg += ' = self.' + getPointName(dummies, key) + '(';
        if (point.inputs.length > 1) {
          if (flowpoints[key].concat_inputs) {
            //torch.cat(tensors, dim=0
            step_msg += 'torch.cat(['
            point.inputs.map(inp_key => step_msg += getStateName(inp_key, flowpoints, states, init_states) + ', ')
            step_msg = step_msg.substring(0, step_msg.length -2 ) + '], dim=' + flowpoints[key].concat_dim + ')'
          } else {
            point.inputs.map(inp_key => step_msg += getStateName(inp_key, flowpoints, states, init_states) + ' + ');
            step_msg = step_msg.substring(0, step_msg.length - 3);
          }
        } else {
          step_msg += getStateName(point.inputs[0], flowpoints, states, init_states)
        }
        if (flowpoints[key].content.pytorch.parameters.extras.gothidden) step_msg += ', tuple([_.data for _ in self.' + getPointName(flowpoints, key) + '_hidden]) if self.' + getPointName(flowpoints, key) + '_hidden else None'
        step_msg += ')'
        step_lib.push({ msg:step_msg, title:point.base_ref });
        if (flowpoints[key].contiguous) {
          var reshape_msg = '';
          reshape_msg += dent(indent, 2) + getStateName(key, flowpoints, states, init_states) + ' = ' + getStateName(key, flowpoints, states, init_states) + '.contiguous()'
          if (flowpoints[key].reshape_ndims > 0) {
            reshape_msg += '.view('
            flowpoints[key].reshape_dims.map(val => {
              reshape_msg += val + ', '
            })
            reshape_msg = reshape_msg.substring(0, reshape_msg.length - 2) + ')'
          }
          step_lib.push({ msg:reshape_msg, title:'Tensor transforms' });
        } else if (flowpoints[key].reshape_ndims > 0) {
          var reshape_msg = '';
          reshape_msg += dent(indent, 2) + getStateName(key, flowpoints, states, init_states) + ' = ' + getStateName(key, flowpoints, states, init_states)
          reshape_msg += '.view('
          flowpoints[key].reshape_dims.map(val => {
            reshape_msg += val + ', '
          })
          reshape_msg = reshape_msg.substring(0, reshape_msg.length - 2) + ')'
          step_lib.push({ msg:reshape_msg, title:'Tensor transforms' });
        }
        if (flowpoints[key].is_output) outputs.push(key);
      }
    }
  })

  // Max length
  var max_l = 0;
  step_lib.map(step => max_l = Math.max(max_l, step.msg.length > 60 ? 0 : step.msg.length))

  // Adding steps
  step_lib.map(step => {
    
    // Adding step
    msg += '\n' + step.msg;

    // Aligning comment with others
    for (var i = 0; i < max_l - step.msg.length; i++) msg += ' ';
    msg += ' # ' + step.title;
  })

  // Adding return
  if (outputs.length === 0) outputs = [order[order.length-1]];
  msg += '\n' + dent(indent, 2) + 'return'
  outputs.map(key => {
    msg += ' ' + getStateName(key, flowpoints, states, init_states) + ','
  })
  msg = msg.slice(0, -1)

  // Returning
  return msg

}


function SaveLoad(flowpoints, dummies, order, indent, library, modelname) {
  var msg = dent(indent, 1) + "def save(self, name=None, extras={}):"
  msg += '\n' + dent(indent, 2) + "if not name: name = self.name"
  msg += '\n' + dent(indent, 2) + "if not '.pth' in name: name += '.pth'"
  msg += "\n" + dent(indent, 2) + "torch.save({"
  order.map(key => {
    const point = dummies[key]
    if (point.base_ref !== 'Input' && point.base_ref !== 'Concatenate' && point.base_ref !== 'Mean' && point.base_ref !== 'Maximum') {
      if (flowpoints[key].content[library]) {
        const pointcode = getPointName(dummies, key)
        msg += "\n" + dent(indent, 3) + "'" + pointcode + "': self." + pointcode + ','
      }
    }
  })
  msg += "\n" + dent(indent, 3) + "'name': self.name,"
  msg += "\n" + dent(indent, 3) + "'extras': extras,"
  msg += "\n" + dent(indent, 2) + "}, name)"
  msg += "\n\n\n" + dent(indent, 1) + "@staticmethod"
  msg += "\n" + dent(indent, 1) + "def load(name='model'):"
  msg += "\n" + dent(indent, 2) + "if not '.pth' in name: name += '.pth'"
  msg += "\n" + dent(indent, 2) + "checkpoint = torch.load(name)"
  msg += "\n" + dent(indent, 2) + "model = " + modelname + "()"
  order.map(key => {
    const point = dummies[key]
    if (point.base_ref !== 'Input' && point.base_ref !== 'Concatenate' && point.base_ref !== 'Mean' && point.base_ref !== 'Maximum') {
      if (flowpoints[key].content[library]) {
        const pointcode = getPointName(dummies, key)
        msg += "\n" + dent(indent, 2) + "model." + pointcode + " = checkpoint['" + pointcode + "']"
      }
    }
  })
  msg += "\n" + dent(indent, 2) + "model.name = checkpoint['name']"
  msg += "\n" + dent(indent, 2) + "return model, checkpoint['extras']"

  // Returning
  return msg
}


function Fit(flowpoints, order, inps, states, dummies, indent, init_states, got_hidden_states, library, outs) {
  const formated_inputs = FormatParamInputs(dummies, inps);
  var msg = '# Helper function for training model'
  msg += '\n' + 'def fit(model, train, test=None, epochs=10, optimizer=optim.Adam, criterion=nn.CrossEntropyLoss, lr=0.001, batch_size=32, shuffle=True, workers=4, progress=True):'
  msg += '\n\n' + dent(indent, 1) + '# Creating data loaders'
  msg += '\n' + dent(indent, 1) + 'train_loader = torch.utils.data.DataLoader('
  msg += '\n' + dent(indent, 2) + 'train,'
  msg += '\n' + dent(indent, 2) + 'batch_size=batch_size,'
  msg += '\n' + dent(indent, 2) + 'shuffle=shuffle,'
  msg += '\n' + dent(indent, 2) + 'num_workers=workers'
  msg += '\n' + dent(indent, 1) + ')'
  msg += '\n' + dent(indent, 1) + 'if test:'
  msg += '\n' + dent(indent, 2) + 'test_loader = torch.utils.data.DataLoader('
  msg += '\n' + dent(indent, 3) + 'test,'
  msg += '\n' + dent(indent, 3) + 'batch_size=batch_size,'
  msg += '\n' + dent(indent, 3) + 'shuffle=False,'
  msg += '\n' + dent(indent, 3) + 'num_workers=workers'
  msg += '\n' + dent(indent, 2) + ')'
  msg += '\n\n' + dent(indent, 1) + '# Init optimizer and criterion'
  msg += '\n' + dent(indent, 1) + "optimizer = optimizer( model.parameters(), lr=lr )"
  msg += '\n' + dent(indent, 1) + "criterion = criterion()"
  msg += '\n\n' + dent(indent, 1) + '# Loss records'
  msg += '\n' + dent(indent, 1) + "train_loss_rec = []"
  msg += '\n' + dent(indent, 1) + "test_loss_rec = []"
  msg += '\n\n' + dent(indent, 1) + "# Device"
  msg += '\n' + dent(indent, 1) + "device = next(model.parameters()).device"
  msg += '\n\n' + dent(indent, 1) + "# Prep model"
  msg += '\n' + dent(indent, 1) + "model.train()"
  msg += '\n\n' + dent(indent, 1) + "# Showing progress?"
  msg += '\n' + dent(indent, 1) + "if progress:"
  msg += '\n' + dent(indent, 2) + "print(f'Running on {device}')"
  msg += '\n' + dent(indent, 2) + "epoch_l = max(2, len(str(epochs)))"
  msg += '\n' + dent(indent, 2) + "msg = '%sEpoch   Training loss' % ''.rjust(2 * epoch_l - 4, ' ')"
  msg += '\n' + dent(indent, 2) + "msg += ('   Testing loss   ' if test else '') + '   Time remaining'"
  msg += '\n' + dent(indent, 2) + "print(msg)"
  msg += '\n' + dent(indent, 2) + "t = time.time()"
  msg += '\n\n' + dent(indent, 1) + "# Looping through epochs"
  msg += '\n' + dent(indent, 1) + "for epoch in range(epochs):"
  msg += '\n\n' + dent(indent, 2) + "# Reset epoch loss"
  msg += '\n' + dent(indent, 2) + "train_loss = 0"
  msg += '\n' + dent(indent, 2) + "test_loss = 0"
  msg += '\n\n' + dent(indent, 2) + "# Looping through training data"
  msg += '\n' + dent(indent, 2) + "for " + formated_inputs + ","
  outs.map((key, idx) => {
    msg += ' ' + getOutputTargetName(key, flowpoints) + ','
  })
  msg = msg.substring(0, msg.length - 1) + " in train_loader:"
  msg += '\n\n' + dent(indent, 3) + "# Loss"
  msg += '\n' + dent(indent, 3) + "loss = criterion( model("
  inps.map(inp_key => {
    msg += getStateName(inp_key, flowpoints, states, init_states) + '.to(device), '
  })
  msg = msg.substring(0, msg.length - 2)
  msg += '),'
  outs.map((key, idx) => {
    msg += ' ' + getOutputTargetName(key, flowpoints) + '.to(device),'
  })
  msg = msg.substring(0, msg.length - 1) + ' )'
  msg += '\n' + dent(indent, 3) + "train_loss += loss.item()"
  msg += '\n\n' + dent(indent, 3) + "# Backward pass and optimization"
  msg += '\n' + dent(indent, 3) + "loss.backward()       # Backward pass"
  msg += '\n' + dent(indent, 3) + "optimizer.step()      # Optimizing weights"
  msg += '\n' + dent(indent, 3) + "optimizer.zero_grad() # Clearing gradients"
  msg += '\n\n' + dent(indent, 2) + "# Testing step"
  msg += '\n' + dent(indent, 2) + "if test:"
  msg += '\n\n' + dent(indent, 3) + "# Switching off autograd"
  msg += '\n' + dent(indent, 3) + "with torch.no_grad():"
  msg += '\n\n' + dent(indent, 4) + "for " + formated_inputs + ","
  outs.map((key, idx) => {
    msg += ' ' + getOutputTargetName(key, flowpoints) + ','
  })
  msg = msg.substring(0, msg.length - 1) + " in train_loader:"
  msg += '\n\n' + dent(indent, 5) + "# Loss"
  msg += '\n' + dent(indent, 5) + "loss = criterion( model("
  inps.map(inp_key => {
    msg += getStateName(inp_key, flowpoints, states, init_states) + '.to(device), '
  })
  msg = msg.substring(0, msg.length - 2)
  msg += '),'
  outs.map((key, idx) => {
    msg += ' ' + getOutputTargetName(key, flowpoints) + '.to(device),'
  })
  msg = msg.substring(0, msg.length - 1) + ' )'
  msg += '\n' + dent(indent, 5) + "test_loss += loss.item()"
  msg += '\n\n' + dent(indent, 2) + "# Adding loss to record"
  msg += '\n' + dent(indent, 2) + "train_loss_rec.append(train_loss / len(train))"
  msg += '\n' + dent(indent, 2) + "if test: test_loss_rec.append(test_loss / len(test))"
  msg += '\n\n' + dent(indent, 2) + "# Showing progress?"
  msg += '\n' + dent(indent, 2) + "if progress:"
  msg += '\n' + dent(indent, 3) + "eta_s = ((time.time() - t) / (epoch + 1)) * (epochs - epoch - 1)"
  msg += '\n' + dent(indent, 3) + "msg = '%s/%s' % (str(epoch + 1).rjust(epoch_l, ' '), str(epochs).ljust(epoch_l, ' '))"
  msg += '\n' + dent(indent, 3) + "msg += ' | %s' % str(round(train_loss_rec[-1], 9)).ljust(13, ' ')"
  msg += '\n' + dent(indent, 3) + "if test: msg += ' | %s' % str(round(test_loss_rec[-1], 9)).ljust(15, ' ')"
  msg += '\n' + dent(indent, 3) + "msg += ' | '"
  msg += '\n' + dent(indent, 3) + "msg += '%sh ' % round(eta_s / 3600) if eta_s > 3600 else ''"
  msg += '\n' + dent(indent, 3) + "msg += '%sm ' % round(eta_s % 3600 / 60) if eta_s > 60 else ''"
  msg += '\n' + dent(indent, 3) + "msg += '%ss ' % round(eta_s % 60)"
  msg += '\n' + dent(indent, 3) + "print(msg)"
  msg += '\n\n' + dent(indent, 1) + '# Finish and return'
  msg += '\n' + dent(indent, 1) + 'model.eval()'
  msg += '\n' + dent(indent, 1) + 'return train_loss_rec, test_loss_rec'
  return msg
}


function Predict(indent, dummies, inps) {
  const formated_inputs = FormatParamInputs(dummies, inps);
  var msg = dent(indent, 1) + 'def predict(self, ' + formated_inputs + '):'
  msg += '\n' + dent(indent, 2) + 'self.eval() # Switch to eval mode'
  msg += '\n' + dent(indent, 2) + 'with torch.no_grad(): # Switch off autograd'
  msg += '\n' + dent(indent, 3) + 'return self(' + formated_inputs + ')'
  return msg
}


export function PyTorchParser(state, order, inps, states, dummies, indent, init_states, outs) {

  var flowpoints = state.flowpoints;
  const library = state.environment.library.toLowerCase()

  // Imports
  var msg = PyTorchImports(indent)

  // Need hidden states?
  var got_hidden_states = false
  order.map(key => {
    if (flowpoints[key].base_ref !== 'Input') {
      if (flowpoints[key].content[library]) {
        if (flowpoints[key].content[library].parameters.extras.gothidden) {
          got_hidden_states = true
        }
      }
    }
  })

  // Adding all code
  msg += '\n\n\n' + Constructor(state, order, indent, dummies, states, init_states, got_hidden_states, library, state.settings.modelID);
  msg += '\n\n\n' + Forward(flowpoints, order, inps, states, dummies, indent, init_states, got_hidden_states, library);
  if (got_hidden_states) msg += '\n\n\n' + ResetHidden(flowpoints, order, inps, states, dummies, indent, init_states, library);
  if (state.environment.include_predict) msg += '\n\n\n' + Predict(indent, dummies, inps)
  if (state.environment.include_saveload) msg += '\n\n\n' + SaveLoad(flowpoints, dummies, order, indent, library, state.environment.modelname === '' ? 'NeuralNet' : state.environment.modelname);
  if (state.environment.include_training) msg += '\n\n\n\n' +  Fit(flowpoints, order, inps, states, dummies, indent, init_states, got_hidden_states, library, outs)

  // Returning
  return msg
}