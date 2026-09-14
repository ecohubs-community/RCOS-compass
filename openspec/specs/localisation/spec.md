# localisation Specification

## Purpose
Covers the languages a community works in: the interface translated through message functions with untranslated strings marked rather than silently substituted, the community's locale selecting the standard's own words from the five the vendored data carries, a steward's ability to change it, and the rule that a community's own text — definitions, decisions, rationales, posts — is never translated by anything, at export and on the public surface included.
## Requirements
### Requirement: The interface is translated, and gaps are visible

Interface strings MUST come from message functions rather than literals, and a
string with no translation in the reader's locale MUST render the default locale
*and be marked as untranslated*. A missing translation MUST NOT be silently
substituted.

#### Scenario: A German community reads a translated screen
- **WHEN** a member whose community locale is German opens a screen whose strings are translated
- **THEN** the interface is in German

#### Scenario: A string has no German translation
- **WHEN** a screen contains a string not yet translated
- **THEN** the English is shown and marked as untranslated

#### Scenario: A message key does not exist
- **WHEN** a message key is referenced that no locale defines
- **THEN** the build fails

### Requirement: A community's locale selects the standard's own words

The standard's clauses, sections, artifacts and glossary terms MUST be shown in
the community's locale where the vendored data has one, and MUST fall back to the
default locale saying so where it does not.

#### Scenario: A Spanish community reads a clause
- **WHEN** a community whose locale is Spanish opens the standard browser
- **THEN** clause text and section titles are Spanish

#### Scenario: The standard has no translation for a term
- **WHEN** a glossary term has no entry in the community's locale
- **THEN** the default locale's text is shown and identified as a fallback

### Requirement: A community's own words are never translated

A community's own text MUST be stored and shown exactly as written — definitions,
decisions, rationales, discussion posts and community artifact content. Nothing
MUST translate them, at export or on the public surface included.

#### Scenario: A German community writes a definition
- **WHEN** a definition is written in German and read by a member whose interface is Spanish
- **THEN** the definition is shown in German

#### Scenario: The community exports
- **WHEN** the bundle is produced
- **THEN** every definition, decision and rationale is the community's own text, untranslated

### Requirement: A community chooses its locale, and can change it

A steward MUST be able to set the community's locale and its time zone, and changing
either MUST change only how the interface, the standard and calendar dates are shown,
and nothing else.

#### Scenario: A steward changes the locale
- **WHEN** the locale is changed from English to German
- **THEN** the interface and standard content are German for every member

#### Scenario: Changing it touches nothing else
- **WHEN** the locale changes
- **THEN** readiness, compliance, the register and every definition are unchanged

#### Scenario: A steward changes the time zone
- **WHEN** a steward changes the community's time zone from UTC to Europe/Berlin
- **THEN** calendar dates and the times shown to members without their own time zone follow Berlin, and no stored moment or decision reference changes

#### Scenario: A member tries to change it
- **WHEN** a member who is not a steward submits a time zone for the community
- **THEN** the change is refused and the time zone is unchanged

