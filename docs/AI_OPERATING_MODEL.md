# AI Operating Model

## Purpose

This document defines the shared product model for AI-assisted work across the active application.

It exists to stop room-by-room drift and to keep the product centered on the user’s job instead of the system’s internal process.

## The Shared User Task Loop

Every active workflow should follow this sequence:

1. `Goal`
2. `What we know`
3. `What is missing`
4. `Best next action`
5. `AI help inside the action`
6. `Review and apply`

If a screen does not clearly fit this loop, it must justify why.

## What AI Should Do

AI is an embedded collaborator, not a sidecar tool palette.

AI should:

- interpret the target task
- compare known evidence to the target
- identify the most important missing detail
- suggest a grounded draft
- help refine that draft
- support review before apply

AI should not:

- force the user to infer provenance
- expose raw internal reasoning structures
- open into a blank prompt box when the system already knows the context
- repeat analysis without changing the next action

## Shared Data Layers

All major rooms should eventually rely on the same conceptual layers.

### 1. Goal Layer

What artifact or outcome are we trying to improve?

Examples:

- targeted resume
- master resume
- cover letter
- LinkedIn headline / summary / post
- interview answer
- networking outreach

### 2. Context Layer

Known structured inputs:

- profession / role family
- industry
- company context
- target role or target audience
- job description or benchmark context
- career profile / positioning context

### 3. Evidence Layer

Known support from the candidate’s actual background:

- direct proof
- adjacent proof
- unsupported area
- overreach risk
- benchmark-only gap
- must-have gap
- preferred signal gap

### 4. Gap Layer

What is not yet strong enough?

This should be explicit:

- what is missing
- why it matters
- whether the user needs to add a detail
- whether the system already has enough to draft

### 5. Action Layer

One clear next action at a time:

- answer a question
- review a draft
- improve a line
- verify a claim
- skip for now

### 6. Review Layer

Before content is treated as final, the user should be able to:

- review the draft
- edit the draft
- approve / apply
- understand what changed

## Shared UX Rules

These apply across active product surfaces.

### Provenance must be explicit

Users should not have to guess whether text came from:

- the job description
- the benchmark
- their resume
- AI inference

### AI must start from context, not emptiness

When AI opens, it should already know:

- what the user is working on
- what evidence exists
- what detail is missing
- what a grounded draft might look like

### Analysis is useful only if it changes action

Long analysis sections are only justified if they materially improve:

- the next decision
- the next question
- the next draft
- the user’s trust in the result

If not, analysis should be folded into the workspace or hidden behind disclosure.

### One active thing at a time

The UI should keep one clear center of gravity:

- one active requirement
- one active section
- one active answer
- one active rewrite

Secondary information can exist, but it must not compete with the main task.

## Responsibilities: LLM vs Application

### LLM responsibilities

- interpret structured context
- generate targeted questions
- produce grounded draft language
- compare candidate evidence to target requirements
- generate critique or review observations

### Application responsibilities

- provide structured context
- validate provenance and evidence quality
- reject unsupported or generic outputs
- preserve workflow state
- present one clear next step
- keep AI embedded inside the task

The application should not ask the LLM to rescue poor structure that the application itself could define more explicitly.

## Room Mapping

### Resume Builder

Primary reference implementation for the model:

- role target
- evidence map
- gaps
- rewrite loop
- review/apply

### Career Profile

Canonical context source:

- positioning
- recurring strengths
- operating style
- trusted evidence inventory

### Cover Letter

Same model as resume, but applied to narrative fit and audience-specific framing.

### LinkedIn

Same model applied to profile sections and content strategy.

### Job Search

Same model applied to role targeting, fit assessment, and next actions.

### Interview Prep

Same model applied to answer quality:

- what the interviewer wants
- what evidence exists
- what is thin
- suggested answer
- improve with AI

