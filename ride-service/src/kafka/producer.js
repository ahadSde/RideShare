const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'ride-service',
  brokers: [process.env.KAFKA_BROKER],
});

const producer = kafka.producer();

const connectProducer = async () => {
  await producer.connect();
  console.log('[Kafka] Producer connected');
};

// Publish an event to a Kafka topic
const publishEvent = async (topic, message) => {
  await producer.send({
    topic,
    messages: [{ value: JSON.stringify(message) }],
  });
  console.log(`[Kafka] Event published → ${topic}:`, message);
};

module.exports = { connectProducer, publishEvent };
