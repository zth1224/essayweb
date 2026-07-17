import type { FieldId } from "../../data/types";
import { fields } from "../../data/fields";
import { getDiscoverySnapshot } from "../../data/discovery-repository";

export const prerender = true;

export const getStaticPaths = () => fields.map((field) => ({
  params: { field: field.id },
  props: { fieldId: field.id },
}));

export const GET = ({ props }: { props: { fieldId: FieldId } }) => new Response(
  JSON.stringify(getDiscoverySnapshot(props.fieldId)),
  {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=900",
    },
  },
);
