## MODIFIED Requirements

### Requirement: Readiness counts answerable MUST clauses and nothing else

Readiness MUST be the proportion of countable clauses that are satisfied, where a
countable clause is a MUST clause the standard says is answered by a section.
Clauses the standard marks as satisfied by the platform or as not a definition
MUST be excluded from both the numerator and the denominator, and the denominator
MUST be computed from the loaded standard rather than written down.

A clause is satisfied only by an adopted definition. Confirmed evidence — the
claim that a community has language about a clause somewhere in a document it
uploaded — MUST NOT satisfy a clause, and MUST NOT appear in either part of the
fraction.

#### Scenario: A community answers a clause
- **WHEN** a definition owning a countable clause gains an adopted version
- **THEN** readiness rises by exactly one clause's worth

#### Scenario: A non-countable clause is examined
- **WHEN** readiness is computed
- **THEN** clauses dispositioned satisfied-by-platform or not-a-definition appear in neither part of the fraction

#### Scenario: A community answers everything answerable
- **WHEN** every countable clause is satisfied
- **THEN** readiness is 100%

#### Scenario: A definition is past its review date
- **WHEN** an adopted definition's review date has passed
- **THEN** it still counts as satisfied
- **AND** it is reported as needing review

#### Scenario: A community confirms evidence for a clause it has not defined
- **WHEN** evidence for a countable clause is confirmed and no definition is adopted for it
- **THEN** readiness does not move
- **AND** the outward compliance claim does not move
