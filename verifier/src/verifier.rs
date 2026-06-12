use grantstream_shared::VerificationJob;
use grantstream_shared::VerificationResult;

pub async fn verify(job: &VerificationJob) -> VerificationResult {
    let now = chrono::Utc::now().naive_utc();

    let valid = validate_evidence(&job.evidence_uri);

    if valid {
        VerificationResult::Approved { checked_at: now }
    } else {
        VerificationResult::Rejected {
            reason: "Evidence URI is empty or malformed".to_string(),
            checked_at: now,
        }
    }
}

fn validate_evidence(uri: &str) -> bool {
    if uri.is_empty() {
        return false;
    }

    uri.starts_with("ipfs://")
        || uri.starts_with("https://")
        || uri.starts_with("http://")
        || uri.starts_with("ar://")
        || uri.starts_with("data:")
}
