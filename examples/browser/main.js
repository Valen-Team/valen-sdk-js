import { Valen } from '@valen/sdk';

const form = document.querySelector('form');
const button = form.querySelector('button');
const status = document.querySelector('#status');
const output = document.querySelector('#result');
let client;
form.addEventListener('submit', async event => {
  event.preventDefault();
  button.disabled = true;
  status.textContent = 'Loading model files and running locally. First use can take several minutes.';
  try {
    client ??= await Valen.local('Valen-Team/Valen-0.8B-ONNX', {
      variant: 'web-portable', device: 'webgpu', wasmPaths: '/ort/',
    });
    const result = await client.decisions({
      input: new FormData(form).get('message'),
      questions: [{ name: 'change_address', type: 'predicate',
        instructions: 'The customer requests a delivery address change.' }],
    });
    output.textContent = JSON.stringify(result.answers[0], null, 2);
    status.textContent = 'Done. Edit the message to run another decision.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
