## ADDED Requirements

### Requirement: Each layer shows whether its artifacts meet the standard's artifact rules

The standard page MUST show, for every layer of the community's adopted
standard, one check per property that the layer's "artifacts MUST be" clause
names, and one check that every mandatory artifact of the layer is complete.
Each check MUST state its result in words, not by colour alone, MUST cite the
clause it comes from, and MUST list what fails when it does not hold. The
checks MUST be computed when the page is read and MUST NOT be stored or set by
hand. Only adopted definitions that answer the standard count; local
definitions MUST NOT.

#### Scenario: A fresh community
- **WHEN** a member opens the standard page of a community that has adopted nothing
- **THEN** Layer 0's completeness check reads "not met" and names the four mandatory Layer 0 artifacts
- **AND** its other checks read "nothing adopted yet"

#### Scenario: The properties come from the clause
- **WHEN** a member reads the checks for Layer 5
- **THEN** they include "kept up to date, with an owner and a review date", because §7.6.2 names it
- **AND** the checks for Layer 2 do not include "adopted through a recorded decision", because §4.7.2 does not name it

#### Scenario: A local definition
- **WHEN** a community has a restricted local definition attached to a Layer 1 artifact
- **THEN** no Layer 1 check counts it

### Requirement: Accessibility allows only the exceptions the layer allows

An adopted definition that is restricted MUST make the accessibility check "not
met" and be listed, in a layer whose rule names accessibility to all members
with no exception. For a layer whose rule allows explicit, bounded exceptions, a restricted
adopted definition MUST count as such an exception only while a live
transparency exception covers it, and MUST be listed with the exception's end
date.

#### Scenario: Restricted in Layer 0
- **WHEN** an adopted Purpose Charter definition is restricted
- **THEN** Layer 0's accessibility check reads "not met" and lists it

#### Scenario: Restricted in Layer 3 under an exception
- **WHEN** an adopted Transparency and Reporting definition is restricted under a live transparency exception ending on 1 March
- **THEN** Layer 3's accessibility check reads "met" and lists it as a bounded exception ending 1 March

### Requirement: Adoption, explicitness and upkeep are checked from what was recorded

An adopted definition whose version has no recorded decision MUST make the
adoption check "not met", where the layer's rule names adoption through a
governance process; and a provisional one MUST make it "needs attention". Where the rule names
explicit and unambiguous artifacts, the check MUST read "a human decides" and
MUST say how many adopted definitions have open linter findings or were never
linted. Where the rule names maintenance with review cycles, an adopted
definition with no review date MUST make the check "not met", and one past its
review date MUST make it "needs attention".

#### Scenario: A provisional definition
- **WHEN** a Layer 0 definition was adopted provisionally
- **THEN** Layer 0's adoption check reads "needs attention" and lists it as awaiting ratification

#### Scenario: Linter findings
- **WHEN** two adopted Layer 1 definitions have open linter findings
- **THEN** Layer 1's explicitness check reads "a human decides" and says two have open findings

#### Scenario: A Layer 5 definition past its review date
- **WHEN** an adopted Role Registry definition's review date has passed
- **THEN** Layer 5's upkeep check reads "needs attention" and lists it

### Requirement: The checks inform and do not decide compliance

The checks MUST NOT change whether the community is compliant. The page MUST
say that compliance already requires every mandatory artifact to be complete and
no definition to be provisional.

#### Scenario: A restricted Layer 0 definition
- **WHEN** Layer 0's accessibility check reads "not met" and every mandatory artifact is complete with nothing provisional
- **THEN** the community's compliance is what it would be without the check

#### Scenario: Another community's data
- **WHEN** community B has a restricted Layer 0 definition
- **THEN** community A's checks are not affected
