#!/bin/bash
# Phase 1 - Task 2-4: VPC + Apigee X provisioning
# Already executed - kept for reference
PROJECT_ID="${PROJECT_ID:-YOUR_PROJECT_ID}"

# Create VPC
gcloud compute networks create apigee-vpc \
  --project=$PROJECT_ID \
  --subnet-mode=custom \
  --bgp-routing-mode=regional

# Create /22 subnet
gcloud compute networks subnets create apigee-subnet \
  --project=$PROJECT_ID \
  --network=apigee-vpc \
  --region=us-central1 \
  --range=10.0.0.0/22

# Allocate peering range
gcloud compute addresses create apigee-peering-range \
  --project=$PROJECT_ID \
  --network=apigee-vpc \
  --global \
  --purpose=VPC_PEERING \
  --prefix-length=16

# Connect VPC peering
gcloud services vpc-peerings connect \
  --project=$PROJECT_ID \
  --network=apigee-vpc \
  --ranges=apigee-peering-range \
  --service=servicenetworking.googleapis.com

# Provision Apigee X org (takes 20-30 min)
gcloud alpha apigee organizations provision \
  --project=$PROJECT_ID \
  --authorized-network=apigee-vpc \
  --runtime-location=us-central1 \
  --analytics-region=us-central1 \
  --async
