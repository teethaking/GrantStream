use serde::{Deserialize, Serialize};
use std::fmt;
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationJob {
    pub grant_id: u64,
    pub milestone_id: u64,
    pub evidence_uri: String,
    pub submitted_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VerificationResult {
    Approved { checked_at: u64 },
    Rejected { reason: String, checked_at: u64 },
}

impl VerificationResult {
    pub fn status_label(&self) -> &'static str {
        match self {
            VerificationResult::Approved { .. } => "Approved",
            VerificationResult::Rejected { .. } => "Rejected",
        }
    }

    pub fn reason(&self) -> Option<&str> {
        match self {
            VerificationResult::Rejected { reason, .. } => Some(reason),
            _ => None,
        }
    }

    pub fn checked_at(&self) -> u64 {
        match self {
            VerificationResult::Approved { checked_at } => *checked_at,
            VerificationResult::Rejected { checked_at, .. } => *checked_at,
        }
    }
}

impl fmt::Display for VerificationResult {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            VerificationResult::Approved { checked_at } => {
                write!(f, "Approved at {}", checked_at)
            }
            VerificationResult::Rejected { reason, checked_at } => {
                write!(f, "Rejected at {}: {}", checked_at, reason)
            }
        }
    }
}

#[derive(Debug, Error)]
pub enum QueueError {
    #[error("channel closed")]
    ChannelClosed,
}

impl From<tokio::sync::mpsc::error::SendError<VerificationJob>> for QueueError {
    fn from(_: tokio::sync::mpsc::error::SendError<VerificationJob>) -> Self {
        QueueError::ChannelClosed
    }
}
