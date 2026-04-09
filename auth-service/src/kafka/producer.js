const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'auth-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
});

const producer = kafka.producer();

const connectProducer = async () => {
  await producer.connect();
  console.log('[Kafka] Auth producer connected');
};

const publishEvent = async (topic, message) => {
  await producer.send({
    topic,
    messages: [{ value: JSON.stringify(message) }],
  });
  console.log(`[Kafka] Event published → ${topic}:`, message);
};

module.exports = { connectProducer, publishEvent };
