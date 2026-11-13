use std::collections::BTreeMap;
use std::fmt;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Who else was recently writing near an object whose parent folder already existed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Neighbour {
    /// Another object in the same folder.
    Sibling,
    /// An object in an ancestor folder, e.g. `a/index.html` for `a/b/index.html`.
    Ancestor,
    /// An object in a descendant folder, e.g. `a/b/index.html` for `a/index.html`.
    Descendant,
    None,
}

impl fmt::Display for Neighbour {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Neighbour::Sibling => "sibling",
            Neighbour::Ancestor => "ancestor",
            Neighbour::Descendant => "descendant",
            Neighbour::None => "no recent neighbour",
        })
    }
}

/// Remembers recent request starts per folder, to explain `409 FolderAlreadyExists`.
pub struct Conflicts {
    window: Duration,
    recent: Mutex<BTreeMap<String, Vec<(Instant, String)>>>,
}

fn folder(key: &str) -> &str {
    key.rsplit_once('/').map_or("", |(folder, _)| folder)
}

impl Conflicts {
    pub fn new(window: Duration) -> Self {
        Self {
            window,
            recent: Mutex::default(),
        }
    }

    pub fn started(&self, key: &str) {
        let now = Instant::now();
        let mut recent = self.recent.lock().unwrap();
        let entries = recent.entry(folder(key).to_owned()).or_default();
        entries.retain(|(at, other)| other != key && now.duration_since(*at) < self.window);
        entries.push((now, key.to_owned()));
    }

    pub fn neighbour(&self, key: &str) -> Neighbour {
        let now = Instant::now();
        let is_recent = |entries: &Vec<(Instant, String)>, except: &str| {
            entries
                .iter()
                .any(|(at, other)| other != except && now.duration_since(*at) < self.window)
        };
        let recent = self.recent.lock().unwrap();
        let folder = folder(key);

        if recent.get(folder).is_some_and(|e| is_recent(e, key)) {
            return Neighbour::Sibling;
        }
        let mut ancestor = folder;
        while let Some((parent, _)) = ancestor.rsplit_once('/') {
            ancestor = parent;
            if recent.get(ancestor).is_some_and(|e| is_recent(e, key)) {
                return Neighbour::Ancestor;
            }
        }
        if !folder.is_empty() && recent.get("").is_some_and(|e| is_recent(e, key)) {
            return Neighbour::Ancestor;
        }
        let descendant = if folder.is_empty() {
            recent.iter().any(|(_, e)| is_recent(e, key))
        } else {
            let (from, to) = (format!("{folder}/"), format!("{folder}0"));
            recent.range(from..to).any(|(_, e)| is_recent(e, key))
        };
        if descendant {
            Neighbour::Descendant
        } else {
            Neighbour::None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_closest_recent_writer() {
        struct Case {
            name: &'static str,
            others: &'static [&'static str],
            key: &'static str,
            expected: Neighbour,
        }
        let cases = [
            Case {
                name: "same folder",
                others: &["a/b/metadata.json"],
                key: "a/b/index.html",
                expected: Neighbour::Sibling,
            },
            Case {
                name: "file in parent folder",
                others: &["a/index.html"],
                key: "a/b/index.html",
                expected: Neighbour::Ancestor,
            },
            Case {
                name: "file at the root",
                others: &["robots.txt"],
                key: "a/b/index.html",
                expected: Neighbour::Ancestor,
            },
            Case {
                name: "file in subfolder",
                others: &["a/b/c/index.html"],
                key: "a/b/index.html",
                expected: Neighbour::Descendant,
            },
            Case {
                name: "sibling folder only",
                others: &["a/bb/index.html", "a/c/index.html"],
                key: "a/b/index.html",
                expected: Neighbour::None,
            },
            Case {
                name: "itself only",
                others: &["a/b/index.html"],
                key: "a/b/index.html",
                expected: Neighbour::None,
            },
        ];
        for case in cases {
            let conflicts = Conflicts::new(Duration::from_secs(60));
            for other in case.others {
                conflicts.started(other);
            }
            assert_eq!(
                conflicts.neighbour(case.key),
                case.expected,
                "{}",
                case.name
            );
        }
    }

    #[test]
    fn ignores_old_writers() {
        let conflicts = Conflicts::new(Duration::ZERO);
        conflicts.started("a/b/metadata.json");
        assert_eq!(conflicts.neighbour("a/b/index.html"), Neighbour::None);
    }
}
