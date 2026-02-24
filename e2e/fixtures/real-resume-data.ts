/**
 * Realistic resume and JD data for full pipeline E2E testing.
 * Substantive enough for LLMs to find real gaps, evidence, and keywords.
 */

export const REAL_COMPANY_NAME = 'TechVision Solutions';

export const REAL_RESUME_TEXT = `SARAH MITCHELL
Director of Cloud Infrastructure & DevOps
Portland, OR | sarah.mitchell@email.com | (503) 555-0147 | linkedin.com/in/sarahmitchell

PROFESSIONAL SUMMARY
Results-driven technology leader with 12+ years of experience in cloud infrastructure, DevOps, and platform engineering. Proven track record of building and scaling engineering teams, driving cloud migration initiatives, and implementing CI/CD pipelines that reduce deployment cycles. Passionate about infrastructure as code, reliability engineering, and empowering development teams to ship faster.

EXPERIENCE

Director of Cloud Infrastructure | Nimbus Technologies | Portland, OR | 2020 – Present
- Lead a team of 14 infrastructure and DevOps engineers supporting 200+ microservices across hybrid cloud environments
- Spearheaded migration of 60+ legacy applications from on-premise data centers to AWS, reducing hosting costs by 35%
- Implemented Kubernetes-based container orchestration platform serving 50M+ API requests daily
- Established SRE practices including SLI/SLO frameworks, reducing P1 incidents by 42% year-over-year
- Managed $4.2M annual cloud infrastructure budget with quarterly optimization reviews
- Partnered with CISO to implement zero-trust networking and container security scanning

Senior DevOps Engineer | CloudScale Systems | Seattle, WA | 2016 – 2020
- Designed and maintained CI/CD pipelines using Jenkins and GitLab CI for 30+ development teams
- Built Terraform modules for provisioning AWS infrastructure across 4 environments
- Implemented monitoring and alerting stack using Prometheus, Grafana, and PagerDuty
- Reduced deployment time from 45 minutes to 8 minutes through pipeline optimization
- Mentored 5 junior engineers and led weekly knowledge-sharing sessions

Systems Engineer | DataFlow Inc. | San Francisco, CA | 2012 – 2016
- Managed Linux server fleet of 200+ nodes across development, staging, and production
- Automated server provisioning using Ansible, reducing setup time from 2 days to 30 minutes
- Implemented centralized logging with ELK stack serving 15 development teams
- Supported 99.95% uptime SLA for customer-facing applications

EDUCATION
B.S. Computer Science | Oregon State University | 2012

CERTIFICATIONS
AWS Solutions Architect – Professional
Certified Kubernetes Administrator (CKA)
HashiCorp Terraform Associate

SKILLS
Cloud: AWS (EC2, ECS, EKS, Lambda, S3, RDS, CloudFormation), GCP (basic)
Containers: Docker, Kubernetes, Helm, Istio
IaC: Terraform, CloudFormation, Ansible, Pulumi
CI/CD: Jenkins, GitLab CI, GitHub Actions, ArgoCD
Monitoring: Prometheus, Grafana, Datadog, PagerDuty, ELK Stack
Languages: Python, Bash, Go, TypeScript
Security: Zero-trust networking, container scanning, IAM policy design`;

export const REAL_JD_TEXT = `Senior Cloud Architect – TechVision Solutions
Location: Remote (US-based)
Department: Platform Engineering

About TechVision Solutions:
TechVision Solutions is a fast-growing enterprise SaaS company serving Fortune 500 clients in the financial services and healthcare sectors. Our platform processes over 2 billion transactions daily and requires the highest standards of reliability, security, and compliance.

Role Overview:
We are seeking a Senior Cloud Architect to design and lead the next generation of our cloud infrastructure. This role will define the technical strategy for our multi-cloud platform, drive adoption of cloud-native patterns, and ensure our infrastructure meets stringent compliance requirements (SOC 2, HIPAA, PCI-DSS).

Key Responsibilities:
- Define and execute the cloud architecture strategy for a multi-cloud environment (AWS primary, Azure secondary)
- Lead architecture reviews and provide technical guidance to 5 engineering teams (40+ engineers)
- Design disaster recovery and business continuity solutions with RPO < 15 min and RTO < 1 hour
- Architect data platform components handling 2B+ daily transactions with sub-100ms latency requirements
- Drive FinOps practices to optimize $8M+ annual cloud spend across multiple accounts
- Establish and enforce cloud security standards aligned with SOC 2, HIPAA, and PCI-DSS frameworks
- Implement service mesh architecture for 300+ microservices
- Partner with VP of Engineering to develop 3-year infrastructure roadmap
- Evaluate and adopt emerging cloud technologies (serverless, edge computing, AI/ML infrastructure)
- Mentor senior engineers and contribute to engineering culture

Required Qualifications:
- 10+ years in cloud infrastructure/architecture roles
- Deep expertise in AWS (required) and Azure or GCP (one additional cloud required)
- Experience architecting for regulated industries (financial services or healthcare preferred)
- Strong background in Kubernetes, service mesh (Istio/Linkerd), and container orchestration at scale
- Proven ability to lead cross-functional architecture decisions
- Experience with Infrastructure as Code (Terraform required)
- Knowledge of compliance frameworks: SOC 2, HIPAA, or PCI-DSS
- Excellent communication skills for presenting to executive stakeholders

Preferred Qualifications:
- AWS Solutions Architect – Professional certification
- Experience with FinOps and cloud cost optimization at scale ($5M+)
- Background in disaster recovery planning and chaos engineering
- Familiarity with data platform architecture (Kafka, Spark, or similar)
- Experience mentoring and developing engineering talent

Compensation: $220,000 – $280,000 base + equity + benefits`;
