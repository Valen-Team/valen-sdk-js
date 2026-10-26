import { Valen } from '@valen-team/sdk';

const client = await Valen.local('Valen-Team/Valen-0.8B-ONNX', { variant: 'fp32' });
try {
  const result = await client.decisions({
  "input": "I moved. Please ship my order to 12 Elm Street instead.",
  "questions": [
    {
      "name": "intent",
      "type": "choice",
      "instructions": "What does the customer want?",
      "choices": [
        {
          "value": "address",
          "description": "Change the delivery address"
        },
        {
          "value": "cancel",
          "description": "Cancel the order"
        }
      ]
    },
    {
      "name": "change_address",
      "type": "predicate",
      "instructions": "The customer requests a delivery address change."
    },
    {
      "name": "explicitness",
      "type": "score",
      "instructions": "How explicit is the request?",
      "levels": [
        {
          "label": "none",
          "description": "No request"
        },
        {
          "label": "possible",
          "description": "Asks whether a change is possible"
        },
        {
          "label": "explicit",
          "description": "Explicitly requests a change"
        }
      ]
    }
  ]
});
  console.log('Intent:', result.answers[0].choice);
  console.log('Address change probability:', result.answers[1].probability.toFixed(3));
  console.log('Explicitness score (0–2):', result.answers[2].score.toFixed(3));
} finally {
  await client.close();
}
