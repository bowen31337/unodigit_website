import React from 'react';

export interface Project {
  slug: string;
  title: string;
  client?: string;
  category: string;
  result: string;
  description: string;
  tags?: string[];
  content: React.ReactNode;
}

export const featuredCase: Project = {
  slug: 'ai-powered-logistics-optimization',
  title: 'AI-Powered Logistics Optimization',
  client: 'TransCorp International',
  category: 'Machine Learning',
  result: '40% reduction in delivery costs',
  description: 'Implemented machine learning algorithms to optimize route planning and demand forecasting for a major logistics provider.',
  tags: ['Machine Learning', 'Python', 'AWS'],
  content: (
    <>
      <p>
        Logistics is a game of margins. For TransCorp International, rising fuel costs and inefficient routing were eating into profitability.
        Our mission was to overhaul their logistics planning with a data-driven, AI-first approach.
      </p>
      <h2>The Challenge</h2>
      <p>
        Legacy routing software was static, failing to account for real-time traffic, weather conditions, or dynamic delivery windows.
        This resulted in longer delivery times, excessive fuel consumption, and missed SLAs.
      </p>
      <h2>The Solution</h2>
      <p>
        We engineered a custom Reinforcement Learning model that processes historical delivery data alongside real-time inputs.
        The system dynamically re-routes drivers in transit, optimizing for fuel efficiency and time-to-delivery.
      </p>
      <h2>Key Technologies</h2>
      <p>
        - <strong>Predictive Modeling:</strong> LSTM networks for demand forecasting.<br/>
        - <strong>Route Optimization:</strong> Genetic algorithms for solving the dynamic Vehicle Routing Problem (VRP).<br/>
        - <strong>Infrastructure:</strong> Scalable AWS serverless architecture for real-time processing.
      </p>
      <h2>Outcomes</h2>
      <p>
        The results were transformative: a 40% reduction in overall delivery costs and a 25% improvement in on-time delivery rates within the first quarter of deployment.
      </p>
    </>
  )
};

export const projects: Project[] = [
  {
    slug: 'predictive-maintenance-platform',
    title: 'Predictive Maintenance Platform',
    client: 'Industrial Co',
    category: 'AI/ML',
    result: '$2M saved annually',
    description: 'IoT sensor data analysis for predictive equipment maintenance.',
    content: (
      <>
        <p>
          Unplanned downtime is the enemy of manufacturing efficiency. Industrial Co faced millions in losses annually due to critical machinery failures.
          We developed a predictive maintenance platform that listens to the machines.
        </p>
        <h2>IoT Data Ingestion</h2>
        <p>
          We aggregated high-frequency vibration and temperature data from thousands of sensors across the factory floor into a centralized data lake.
        </p>
        <h2>Anomaly Detection</h2>
        <p>
          Using unsupervised learning techniques (Isolation Forests), our model detects subtle deviations in equipment behavior weeks before a failure occurs.
        </p>
        <h2>Impact</h2>
        <p>
          The system now alerts maintenance teams to potential issues with 95% accuracy, virtually eliminating unplanned downtime and saving over $2M annually in lost production and repairs.
        </p>
      </>
    )
  },
  {
    slug: 'ecommerce-recommendation-engine',
    title: 'E-Commerce Recommendation Engine',
    client: 'RetailMax',
    category: 'Data Science',
    result: '35% increase in sales',
    description: 'Personalized product recommendations using collaborative filtering.',
    content: (
      <>
        <p>
          In e-commerce, personalization is king. RetailMax needed to move beyond generic "bestsellers" lists to truly individualized shopping experiences.
        </p>
        <h2>Hybrid Filtering Approach</h2>
        <p>
          We implemented a hybrid recommendation engine combining collaborative filtering (users like you bought...) and content-based filtering (items similar to this...).
        </p>
        <h2>Real-time Personalization</h2>
        <p>
          The engine updates user profiles in real-time as they browse, adjusting recommendations instantly to reflect their current intent and session context.
        </p>
        <h2>Results</h2>
        <p>
          A/B testing showed a 35% increase in cross-sell revenue and a 20% uplift in average order value (AOV).
        </p>
      </>
    )
  },
  {
    slug: 'healthcare-analytics-dashboard',
    title: 'Healthcare Analytics Dashboard',
    client: 'MediCare Plus',
    category: 'Web Development',
    result: '60% faster insights',
    description: 'Real-time analytics platform for patient outcome tracking.',
    content: (
      <>
        <p>
          Healthcare providers are drowning in data but starving for insights. MediCare Plus needed a way to visualize patient outcomes and operational efficiency in real-time.
        </p>
        <h2>Data Integration</h2>
        <p>
          We built a secure, HIPAA-compliant pipeline integrating Electronic Health Records (EHR) with operational data sources.
        </p>
        <h2>Interactive Visualization</h2>
        <p>
          Using D3.js and React, we created an interactive dashboard allowing administrators to drill down from hospital-wide metrics to individual ward performance.
        </p>
        <h2>Impact</h2>
        <p>
          Decision-makers now access critical insights 60% faster, leading to improved resource allocation and better patient care outcomes.
        </p>
      </>
    )
  },
  {
    slug: 'fintech-mobile-app',
    title: 'Fintech Mobile App',
    client: 'PayStream',
    category: 'Mobile',
    result: '500K+ downloads',
    description: 'Cross-platform mobile banking application with biometric security.',
    content: (
      <>
        <p>
          PayStream wanted to disrupt the neobank market with a mobile-first experience that was secure yet frictionless.
        </p>
        <h2>Security First</h2>
        <p>
          We implemented multi-factor authentication and biometric login (FaceID/TouchID) to ensure banking-grade security without compromising user experience.
        </p>
        <h2>Flutter Development</h2>
        <p>
          Using Flutter, we delivered a high-performance native experience across both iOS and Android from a single codebase, accelerating time-to-market.
        </p>
        <h2>Growth</h2>
        <p>
          The app reached 500,000 downloads in its first year, maintaining a 4.8-star rating due to its intuitive design and reliability.
        </p>
      </>
    )
  },
  {
    slug: 'supply-chain-automation',
    title: 'Supply Chain Automation',
    client: 'GlobalTrade',
    category: 'Automation',
    result: '75% process automation',
    description: 'End-to-end supply chain digitization with AI-driven insights.',
    content: (
      <>
        <p>
          GlobalTrade's supply chain was bogged down by manual paperwork and opaque processes. We digitized and automated their end-to-end workflow.
        </p>
        <h2>Intelligent Document Processing (IDP)</h2>
        <p>
          We deployed AI models to automatically extract data from invoices, bills of lading, and customs forms, reducing manual entry errors by 99%.
        </p>
        <h2>Process Automation</h2>
        <p>
          Robotic Process Automation (RPA) bots now handle routine tasks like order confirmation and inventory updates across disparate ERP systems.
        </p>
        <h2>Results</h2>
        <p>
          The initiative achieved 75% process automation, freeing up human staff to focus on strategic vendor relationships and exception handling.
        </p>
      </>
    )
  },
  {
    slug: 'customer-service-chatbot',
    title: 'Customer Service Chatbot',
    client: 'ServiceFirst',
    category: 'NLP',
    result: '80% query resolution',
    description: 'Intelligent chatbot handling customer inquiries 24/7.',
    content: (
      <>
        <p>
          ServiceFirst needed to scale their support operations without linearly scaling headcount. The solution was an intelligent, conversational AI.
        </p>
        <h2>Natural Language Understanding (NLU)</h2>
        <p>
          Unlike rigid rule-based bots, our solution uses advanced NLU to understand customer intent, sentiment, and context, providing human-like responses.
        </p>
        <h2>Seamless Handoff</h2>
        <p>
          When the bot encounters a complex issue or an irate customer, it seamlessly escalates the chat to a human agent, providing them with a full summary of the interaction.
        </p>
        <h2>Efficiency</h2>
        <p>
          The chatbot now resolves 80% of routine queries autonomously, drastically reducing wait times and operational costs.
        </p>
      </>
    )
  }
];
