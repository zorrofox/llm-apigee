#!/bin/bash
# Phase 1 - Task 1: Enable required GCP APIs
# Already executed - kept for reference
PROJECT_ID="${PROJECT_ID:-YOUR_PROJECT_ID}"

gcloud services enable \
  apigee.googleapis.com \
  apigeeconnect.googleapis.com \
  compute.googleapis.com \
  servicenetworking.googleapis.com \
  cloudresourcemanager.googleapis.com \
  aiplatform.googleapis.com \
  vectorsearch.googleapis.com \
  secretmanager.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  --project=$PROJECT_ID
